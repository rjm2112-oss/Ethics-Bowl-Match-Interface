"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const harness = require("./helpers/renderer-harness");

function fixture() {
    const button = {addEventListener(event, listener) { this[event] = listener; }};
    const state = {transcript:[], speechPlaybackActive:true,
        speechAudioEl:{dataset:{}, addEventListener(){}}};
    const stops = [];
    const context = harness.load(["ensureSpeechUi", "refreshSpeechUi", "stopSpeechFromControl"], {
        state,
        document:{body:{contains:()=>true}, createElement:()=>({addEventListener(){}}), getElementById:()=>button},
        ensureComposerModeIndicatorUi(){}, updateComposerModeIndicator(){},
        stopSpeechPlayback:(...args)=>stops.push(args)
    });
    context.ensureSpeechUi();
    return {context, state, button, stops};
}

test("manual stop cannot interrupt either participant, including queued speech and gaps between chunks", () => {
    for (const kind of ["ai", "ai-alt"]) {
        const f = fixture();
        assert.equal(f.button.disabled, false);
        // A participant can be queued after the last UI update. Even a stale
        // activation must respect the current delivery state.
        const message = {kind, substantive:true, speechDeliveryState:"pending", text:""};
        f.state.transcript.push(message);
        f.button.click();
        assert.deepEqual(f.stops, []);
        f.context.refreshSpeechUi();
        assert.equal(f.button.disabled, true);
        assert.match(f.button.title, /Participant speeches/);
        message.text = "The first chunk has finished.";
        f.context.refreshSpeechUi();
        assert.equal(f.button.disabled, true);
        assert.equal(f.context.stopSpeechFromControl(), false);
        message.speechDeliveryState = "complete";
        f.context.refreshSpeechUi();
        assert.equal(f.button.disabled, false);
        assert.equal(f.button.title, "");
        f.button.click();
        assert.deepEqual(f.stops, [[true]]);
    }
});

test("moderator read-aloud remains stoppable and idle controls remain disabled", () => {
    const f = fixture();
    f.state.transcript.push({kind:"moderator", text:"The next case.", speechDeliveryState:"pending"});
    f.context.refreshSpeechUi();
    assert.equal(f.button.disabled, false);
    f.button.click();
    assert.deepEqual(f.stops, [[true]]);
    f.state.speechPlaybackActive = false;
    f.context.refreshSpeechUi();
    assert.equal(f.button.disabled, true);
    assert.equal(f.context.stopSpeechFromControl(), false);
    assert.equal(f.stops.length, 1);
});
