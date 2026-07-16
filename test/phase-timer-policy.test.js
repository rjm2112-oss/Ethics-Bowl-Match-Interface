"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { preloadsDuringModerator, startsWithAutoSpeech, usesNaturalModeratorHandoff } = require("../src/shared/phase-timer-policy");

test("AI speaking phases synchronize their timers with playback", () => {
    const options = { speakerIsAiControlled: true, judgeMode: "ai" };
    assert.equal(startsWithAutoSpeech({ kind: "speech", duration: 300 }, options), true);
    assert.equal(startsWithAutoSpeech({ kind: "judgeAnswer", duration: 60 }, options), true);
    assert.equal(startsWithAutoSpeech({ kind: "judgeQuestion", duration: 30 }, options), true);
});

test("human speaking and AI conferral timers still start after the moderator", () => {
    assert.equal(startsWithAutoSpeech(
        { kind: "speech", duration: 300 },
        { speakerIsAiControlled: false, judgeMode: "human" }
    ), false);
    assert.equal(startsWithAutoSpeech(
        { kind: "judgeQuestion", duration: 30 },
        { speakerIsAiControlled: false, judgeMode: "human" }
    ), false);
    assert.equal(startsWithAutoSpeech(
        { kind: "confer", duration: 120 },
        { speakerIsAiControlled: true, judgeMode: "ai" }
    ), false);
    assert.equal(startsWithAutoSpeech(
        { kind: "speech", duration: null },
        { speakerIsAiControlled: true, judgeMode: "ai" }
    ), false);
});

test("AI participant speeches and judge answers preload while the moderator introduces them", () => {
    assert.equal(preloadsDuringModerator(
        { kind: "speech", subtype: "presentation", duration: 300 },
        { speakerIsAiControlled: true }
    ), true);
    assert.equal(preloadsDuringModerator(
        { kind: "speech", subtype: "commentary", duration: 180 },
        { speakerIsAiControlled: false }
    ), false);
    assert.equal(preloadsDuringModerator(
        { kind: "judgeAnswer", duration: 140 },
        { speakerIsAiControlled: true }
    ), true);
    assert.equal(preloadsDuringModerator(
        { kind: "judgeAnswer", duration: 140 },
        { speakerIsAiControlled: false }
    ), false);
    assert.equal(preloadsDuringModerator(
        { kind: "confer", duration: 180 },
        { speakerIsAiControlled: true }
    ), false);
});

test("only the three AI participant speeches receive a natural moderator handoff", () => {
    const ai = { speakerIsAiControlled: true };
    assert.equal(usesNaturalModeratorHandoff({ kind: "speech", subtype: "presentation" }, ai), true);
    assert.equal(usesNaturalModeratorHandoff({ kind: "speech", subtype: "commentary" }, ai), true);
    assert.equal(usesNaturalModeratorHandoff({ kind: "speech", subtype: "response" }, ai), true);
    assert.equal(usesNaturalModeratorHandoff({ kind: "judgeAnswer" }, ai), false);
    assert.equal(usesNaturalModeratorHandoff(
        { kind: "speech", subtype: "presentation" },
        { speakerIsAiControlled: false }
    ), false);
});
