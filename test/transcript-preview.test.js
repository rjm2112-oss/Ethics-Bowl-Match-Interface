"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const harness = require("./helpers/renderer-harness");
const delivery = require("../src/shared/speech-delivery");
const discussion = require("../src/shared/transcript-context");
const { alignRecognized } = require("../src/shared/word-alignment");

function element(tag = "div") {
    return {
        tag, children: [], dataset: {}, className: "", _text: "", textWrites: 0,
        get textContent() { return this._text + this.children.map(child => child.textContent).join(""); },
        set textContent(value) { this.textWrites++; this._text = String(value); this.children = []; },
        appendChild(child) { return this.insertBefore(child, null); },
        insertBefore(child, before) {
            child.parent?.removeChild(child); child.parent = this;
            const index = before ? this.children.indexOf(before) : this.children.length;
            this.children.splice(index, 0, child); return child;
        },
        removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parent = null; },
        replaceChildren(...children) { this.children.forEach(child => { child.parent = null; }); this.children = []; children.forEach(child => this.appendChild(child)); },
        querySelector(selector) {
            return this.children.find(child => child.className === selector.slice(1))
                || this.children.map(child => child.querySelector?.(selector)).find(Boolean) || null;
        },
        get height() { return this.textContent.length > 500 ? 700 : 100; },
        getBoundingClientRect() {
            const top = this.parent ? this.parent.children.slice(0, this.parent.children.indexOf(this)).reduce((sum, child) => sum + child.height, 0) - this.parent.scrollTop : 0;
            return { top, bottom: top + this.height };
        }
    };
}

function fixture() {
    const chat = element(), state = { transcript: [], matchRunId: 4, speechToken: 2 };
    chat.scrollTop = 0; chat.clientHeight = 500;
    Object.defineProperty(chat, "scrollHeight", { get: () => chat.children.reduce((sum, child) => sum + child.height, 0) });
    chat.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
    let scrollAnimations = 0;
    const c = harness.load(["appendMessage", "renderTranscript", "captureActiveSpeechDelivery", "queueSpeechFollowScroll", "scrollSpeechProgressIntoView", "buildSpeechQueueEntries"], {
        state, chatEl: chat, emptyStateEl: element(),
        document: { createElement: element, createTextNode: text => ({ textContent: text }) },
        window: { requestAnimationFrame() { scrollAnimations++; return 1; } },
        getMessageBodyEl: index => chat.children.find(row => row.dataset.messageIndex === String(index))?.querySelector(".bubble-body"),
        getVoiceKeyForMessage: kind => kind, shouldAutoSpeakMessage: () => true,
        enqueueTranscriptSpeech() {}, formatBubbleTime: () => "", l: en => en
    });
    return { c, state, chat, scrollAnimations: () => scrollAnimations };
}

test("full preview is readable before audio while serialized and model transcripts stay undelivered", () => {
    const { c, state, chat } = fixture();
    const preview = "Selected speech, including the unheard conclusion.";
    c.appendMessage("ai", "Alex", preview, { phaseId: "presentation", caseNum: 1 });
    const message = state.transcript[0];
    assert.equal(chat.children[0].querySelector(".bubble-body").textContent, preview);
    assert.equal(message.text, "");
    assert.equal(message.speechDeliveryState, "pending");
    assert.doesNotMatch(JSON.stringify(message), /unheard conclusion/);
    assert.throws(() => discussion.discussion({ messages: [message], phases: [] }), /waiting for a verified/);
    delivery.beginSpokenCutoff(message);
    delivery.finalizeSpokenCutoff(message, "Actually heard prefix.");
    c.renderTranscript();
    assert.equal(chat.children[0].querySelector(".bubble-body").textContent, "Actually heard prefix.");
    assert.equal(delivery.previewText(message), null);
    const context = discussion.discussion({ messages: [message], phases: [] });
    assert.match(context, /Actually heard prefix/); assert.doesNotMatch(context, /unheard conclusion/);
});

test("word updates keep preview nodes and user scroll position stable; only followed new turns scroll", () => {
    const { c, state, chat, scrollAnimations } = fixture();
    c.appendMessage("ai", "Alex", "Generated reading preview. ".repeat(60).trim());
    const message = state.transcript[0], row = chat.children[0], body = row.querySelector(".bubble-body");
    const writes = body.textWrites;
    delivery.registerSpokenTranscript(message, 0, {
        transcriptText: "First heard.",
        alignment: alignRecognized("First heard.", [{ word: "First", start: 0, end: .5 }, { word: "heard", start: .5, end: 1 }], 1.1)
    });
    const audio = { currentTime: .5, played: { length: 1, start: () => 0, end: () => audio.currentTime } };
    state.currentDeliveryPlayback = { message, entry: { transcriptIndex: 0, chunkIndex: 0 }, audio, token: state.speechToken, runId: state.matchRunId };
    chat.scrollTop = 120;
    c.captureActiveSpeechDelivery(); audio.currentTime = 1; c.captureActiveSpeechDelivery();
    assert.equal(message.text, "First heard.");
    assert.equal(chat.children[0], row); assert.equal(row.querySelector(".bubble-body"), body);
    assert.equal(body.textWrites, writes); assert.equal(chat.scrollTop, 120);
    c.queueSpeechFollowScroll(); c.scrollSpeechProgressIntoView();
    assert.equal(chat.scrollTop, 120); assert.equal(scrollAnimations(), 0);
    c.appendMessage("moderator", "Moderator", "Next announcement.");
    assert.equal(chat.scrollTop, 120);
    chat.scrollTop = chat.scrollHeight - chat.clientHeight;
    c.appendMessage("ai-alt", "Morgan", "Another full preview. ".repeat(60).trim());
    assert.equal(chat.scrollTop, 800);
    c.renderTranscript(); assert.equal(chat.scrollTop, 800);
});

test("synthesis and delivery share participant chunk boundaries and bounded exact text", () => {
    const { c, state } = fixture();
    const short = "A complete participant answer. ".repeat(50).trim();
    for (const kind of ["ai", "ai-alt"]) assert.equal(c.buildSpeechQueueEntries(kind, short).length, 1);
    const long = "A longer ethical argument with a clear conclusion. ".repeat(120).trim();
    const entries = c.buildSpeechQueueEntries("ai", long);
    assert.equal(entries.map(entry => entry.text).join(" "), long);
    assert.ok(entries.length > 1 && entries.length < 4);
    assert.ok(entries.every(entry => entry.text.length <= 4096));
    c.appendMessage("ai", "Alex", long);
    const message = state.transcript[0];
    entries.forEach((entry, index) => {
        delivery.registerSpokenTranscript(message, index, { transcriptText: entry.text });
        assert.equal(delivery.completeChunk(message, index), true);
    });
    assert.equal(message.speechDeliveryState, "complete"); assert.equal(message.text, long);
    assert.equal(delivery.previewText(message), null);
    assert.ok(c.buildSpeechQueueEntries("moderator", short).every(entry => entry.text.length <= 800));
});
