"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const harness = require("./helpers/renderer-harness");

function fixture() {
    let focused = false;
    const c = harness.load(["requestHumanCoinCall", "handleHumanCoinCall", "cancelHumanCoinCall"], {
        state: { matchRunId: 7 }, refreshControls() {}, updatePhaseHeader() {},
        coinHeadsBtnEl: { focus() { focused = true; } }
    });
    return { c, focused: () => focused };
}

for (const choice of ["heads", "tails"]) test(`a human can call ${choice} once, only when invited`, async () => {
    const { c, focused } = fixture();
    assert.equal(c.handleHumanCoinCall(choice), false);
    const pending = c.requestHumanCoinCall();
    assert.equal(c.state.waitingForCoinCall, true);
    assert.equal(focused(), true);
    assert.equal(c.handleHumanCoinCall("invalid"), false);
    assert.equal(c.handleHumanCoinCall(choice), true);
    assert.equal(c.handleHumanCoinCall(choice), false);
    assert.equal(await pending, choice);
    assert.equal(c.state.coinCall, choice);
    assert.equal(c.state.waitingForCoinCall, false);
});

test("reset cancels an unanswered call and stale clicks cannot start an old match", async () => {
    const { c } = fixture();
    const pending = c.requestHumanCoinCall();
    c.cancelHumanCoinCall();
    assert.equal(await pending, "");
    assert.equal(c.handleHumanCoinCall("heads"), false);
    const replacement = c.requestHumanCoinCall();
    c.state.matchRunId++;
    assert.equal(c.handleHumanCoinCall("tails"), false);
    c.cancelHumanCoinCall();
    assert.equal(await replacement, "");
});
