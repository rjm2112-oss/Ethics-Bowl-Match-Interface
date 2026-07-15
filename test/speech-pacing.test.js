"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const speechPacing = require("../src/shared/speech-pacing");

test("moderator speech keeps sentence boundaries and inserts audible pauses", () => {
    const chunks = speechPacing.buildModeratorSpeechChunks(
        "Welcome to the match. We will begin with Case #1! Please listen carefully.",
        { maxLength: 420, locale: "en-US" }
    );

    assert.deepEqual(chunks, [
        { text: "Welcome to the match.", pauseAfterMs: 360 },
        { text: "We will begin with Case #1!", pauseAfterMs: 360 },
        { text: "Please listen carefully.", pauseAfterMs: 0 }
    ]);
});

test("moderator speech uses a longer pause between paragraphs", () => {
    const chunks = speechPacing.buildModeratorSpeechChunks(
        "The first case is complete.\n\nWe will now proceed to the second case.",
        { maxLength: 420, locale: "en-US" }
    );

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].pauseAfterMs, 650);
    assert.equal(chunks[1].pauseAfterMs, 0);
});

test("case questions receive terminal punctuation before the next moderator sentence", () => {
    assert.equal(speechPacing.ensureSentenceEnding("What should be done", "?"), "What should be done?");
    assert.equal(speechPacing.ensureSentenceEnding("What should be done?", "?"), "What should be done?");
});

test("long moderator sentences split safely without adding an artificial mid-sentence pause", () => {
    const chunks = speechPacing.buildModeratorSpeechChunks(
        "This deliberately long moderator sentence contains enough words to require several small audio chunks before it reaches its concluding punctuation.",
        { maxLength: 45, locale: "en-US" }
    );

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(({ text }) => text.length <= 45));
    assert.ok(chunks.every(({ pauseAfterMs }) => pauseAfterMs === 0));
    assert.equal(chunks.map(({ text }) => text).join(" "), "This deliberately long moderator sentence contains enough words to require several small audio chunks before it reaches its concluding punctuation.");
});
