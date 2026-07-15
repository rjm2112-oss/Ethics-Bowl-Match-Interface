"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const prompts = require("../src/shared/ai-turn-prompt");

const CASE_DATA = Object.freeze({
    title: "A difficult case",
    question: "What should be done?",
    text: "The complete case text."
});
const WORD_GUIDANCE = Object.freeze({ min: 368, max: 393, preferredTarget: 380 });

function buildSpeechPrompt(subtype, transcript = "Earlier remarks.") {
    return prompts.buildAiTurnPrompt({
        phase: { kind: "speech", subtype, title: `Case #1: ${subtype}` },
        caseData: CASE_DATA,
        transcript,
        wordGuidance: WORD_GUIDANCE
    });
}

test("commentary receives the commentary rubric rather than the response rubric", () => {
    const prompt = buildSpeechPrompt("commentary");
    assert.match(prompt, /developed a manageably small number/i);
    assert.match(prompt, /novel options to modify their position/i);
    assert.doesNotMatch(prompt, /prioritized the other participant's main suggestions/i);
});

test("response receives the response-to-feedback rubric rather than the commentary rubric", () => {
    const prompt = buildSpeechPrompt("response");
    assert.match(prompt, /prioritized the other participant's main suggestions/i);
    assert.match(prompt, /refined the position or clearly explained why refinement was not required/i);
    assert.doesNotMatch(prompt, /developed a manageably small number/i);
});

test("participant prompts preserve the complete transcript beyond the former 15000-character cutoff", () => {
    const transcript = `[EARLIEST]\n${"full-context ".repeat(1800)}\n[LATEST]`;
    assert.ok(transcript.length > 15000);
    const prompt = buildSpeechPrompt("response", transcript);
    const transcriptStart = "Transcript so far for this case:\n";
    const sectionStart = prompt.indexOf(transcriptStart) + transcriptStart.length;
    const sectionEnd = prompt.indexOf("\n\nCurrent phase:", sectionStart);

    assert.ok(sectionStart >= transcriptStart.length);
    assert.ok(sectionEnd > sectionStart);
    assert.equal(prompt.slice(sectionStart, sectionEnd), transcript);
    assert.doesNotMatch(prompt, /\[Text clipped for brevity\.\]/);
});

test("judge-answer prompts also preserve the complete transcript", () => {
    const transcript = `[START]\n${"judge-context ".repeat(1500)}\n[FINAL ANSWER CONTEXT]`;
    const prompt = prompts.buildAiTurnPrompt({
        phase: { kind: "judgeAnswer", title: "Judge 1 Answer" },
        caseData: CASE_DATA,
        transcript,
        judgeQuestion: "Which duty should control here?",
        wordGuidance: { min: 260, max: 300, preferredTarget: 275 }
    });

    assert.match(prompt, /\[START\]/);
    assert.match(prompt, /\[FINAL ANSWER CONTEXT\]/);
    assert.ok(prompt.includes(transcript));
});
