"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const harness = require("./helpers/renderer-harness");
const phasesApi = require("../src/shared/match-phases");
const contexts = require("../src/shared/transcript-context");

function fixture({ locale = "en", generate, prepareAudio } = {}) {
    const calls = [], audio = [], announcements = [], statuses = [], participantMessages = [];
    const phases = phasesApi.build({ leadByCase: {1: "human", 2: "ai"}, locale });
    const state = {
        started: true, matchRunId: 3, phaseReady: false, currentPhaseIndex: 0, phases,
        names: {human: "Alex", ai: "Morgan"}, participantTypes: {human: "ai", ai: "ai"},
        leadByCase: {1: "human", 2: "ai"}, locale,
        cases: {1: {title: "One", text: "Full first case.", question: "Should we?"}, 2: {title: "Two", text: "Full second case.", question: "Why?"}},
        transcript: [{kind: "moderator", phaseId: phases[0].id, text: "READING_CASE", speechDeliveryState: "pending"}]
    };
    const c = harness.load(["primeAiPreparationForPhase", "maybePrepareAiTurnForPhase", "getAiPreparationTarget", "finishTimedPhaseAfterAudioTranscript", "concludeTimedOutHumanPhase", "generateAiTurnForPhase", "handleAiConferPhase", "handleNextAction"], {
        state, activeLocale: locale, localStorage: {getItem: () => ""},
        callAI: request => {
            calls.push(request);
            return generate ? generate(request) : Promise.resolve(Array(request.recordContext.wordTarget).fill("Selected").join(" "));
        },
        primeWholeSpeechAudioForPhase: (phase, text) => {
            audio.push({phaseId: phase.id, text});
            if (prepareAudio) prepareAudio(phase, text);
        },
        maybeCompletePreparedAiConferral() {}, updateComposerModeIndicator() {},
        prepareWholeSpeechAudioForPhase: async () => ({}),
        appendParticipantMessage: (...args) => participantMessages.push(args),
        setBusy: value => {state.busy = value;}, setStatus: (...args) => statuses.push(args),
        setPhaseAwaitingPlayback: phaseId => {state.phaseAwaitingPlaybackForId = phaseId;},
        clearPhaseAwaitingPlayback: () => {state.phaseAwaitingPlaybackForId = "";},
        appendMessage: (...args) => announcements.push(args), console: {error() {}}
    });
    const phase = id => phases.find(item => item.id === id);
    const settle = async () => { await Promise.all(Object.values(state.aiPreparationPromises)); };
    return {c, state, calls, audio, announcements, statuses, participantMessages, phase, settle};
}
function delivered(f, phase, status = "complete", text = "Actually heard.") {
    f.state.transcript.push({kind: phase.kind === "judgeQuestion" ? "judge" : "ai", label: "Speaker", caseNum: phase.caseNum, phaseId: phase.id, speechDeliveryState: status, text});
}

test("first presentation prepares during case reading in both languages, sharing one selected answer and audio with conferral", async () => {
    for (const locale of ["en", "fr-ca"]) {
        let resolve;
        const f = fixture({locale, generate: () => new Promise(done => {resolve = done;})});
        f.c.primeAiPreparationForPhase(f.phase("case1-moderator"));
        f.c.primeAiPreparationForPhase(f.phase("case1-presentation-confer"));
        assert.equal(f.calls.length, 1);
        assert.equal(f.state.phaseReady, false, "case/moderator playback need not finish");
        const request = f.calls[0];
        assert.equal(request.recordContext.phaseId, "case1-presentation");
        assert.ok(request.userPrompt.includes("Full first case."));
        assert.ok(request.userPrompt.includes("Should we?"));
        assert.doesNotMatch(request.userPrompt, /READING_CASE/);
        assert.match(request.systemPrompt, /Alex.*Morgan/);
        resolve(Array(request.recordContext.wordTarget).fill("Selected").join(" "));
        await f.settle();
        await f.c.maybePrepareAiTurnForPhase(f.phase("case1-presentation"));
        assert.equal(f.calls.length, 1);
        assert.equal(f.audio.length, 1);
        assert.equal(f.state.transcript.length, 1, "prepared future text remains outside dialogue/model context");
        assert.equal(contexts.discussion({messages: f.state.transcript, phases: f.state.phases}), "");
    }
});

test("commentary and response wait for complete delivered context, then prepare before the next moderator handoff", async () => {
    for (const [previousId, targetId] of [["case1-presentation", "case1-commentary"], ["case1-commentary", "case1-response"]]) {
        const f = fixture(), previous = f.phase(previousId);
        delivered(f, previous, "pending", "Heard prefix.");
        f.c.primeAiPreparationForPhase(previous);
        assert.equal(f.calls.length, 0);
        f.state.transcript.at(-1).speechDeliveryState = "complete";
        f.c.primeAiPreparationForPhase(previous);
        await f.settle();
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].recordContext.phaseId, targetId);
        assert.match(f.calls[0].userPrompt, /Heard prefix/);
        assert.equal(f.audio[0].phaseId, targetId);
        f.c.primeAiPreparationForPhase(f.phase(targetId + "-confer"));
        await f.settle();
        assert.equal(f.calls.length, 1, "phase-entry/activation reuse the bounded preparation");
    }
});

test("unresolved, transcribing, simulated or absent substantive delivery blocks background requests", () => {
    for (const status of [undefined, "pending", "unresolved", "transcribing", "simulated"]) {
        const f = fixture();
        delivered(f, f.phase("case1-presentation"), status);
        f.state.transcript.at(-1).speechDeliveryState = status;
        f.c.primeAiPreparationForPhase(f.phase("case1-commentary-confer"));
        assert.equal(f.calls.length, 0);
    }
});

test("verified cutoff starts the next participant before Time and excludes unplayed text", async () => {
    const f = fixture(), previous = f.phase("case1-presentation");
    f.state.currentPhaseIndex = f.state.phases.indexOf(previous);
    f.state.interruptedPhaseIds.add(previous.id);
    delivered(f, previous, "cutoff", "Verified heard prefix.");
    f.c.finishTimedPhaseAfterAudioTranscript(previous);
    assert.equal(f.calls.length, 1);
    assert.equal(f.announcements[0][2], "Time.");
    await f.settle();
    assert.equal(f.calls[0].recordContext.phaseId, "case1-commentary");
    assert.match(f.calls[0].userPrompt, /Verified heard prefix/);
    assert.doesNotMatch(f.calls[0].userPrompt, /Selected|READING_CASE/);
});

test("human timeout prepares from its finalized submitted text before the Time announcement", async () => {
    const f = fixture(), previous = f.phase("case1-presentation");
    f.state.participantTypes.human = "human";
    f.state.interruptedPhaseIds.add(previous.id);
    delivered(f, previous, "complete", "Finalized human contribution.");
    f.c.concludeTimedOutHumanPhase(previous);
    assert.equal(f.calls.length, 1);
    assert.equal(f.announcements[0][2], "Time.");
    await f.settle();
    assert.match(f.calls[0].userPrompt, /Finalized human contribution/);
});

test("judge answers wait for completed question delivery and final binding; questions themselves are never prefetched", async () => {
    const f = fixture(), question = f.phase("case1-judge1-question"), answer = f.phase("case1-judge1-answer");
    delivered(f, f.phase("case1-response"));
    f.c.primeAiPreparationForPhase(f.phase("case1-response"));
    assert.equal(f.calls.length, 0);
    delivered(f, question, "pending", "Question prefix");
    f.state.askedJudgeQuestions[answer.id] = "UNPLAYED_FULL_QUESTION";
    f.c.primeAiPreparationForPhase(question);
    assert.equal(f.calls.length, 0);
    f.state.transcript.at(-1).speechDeliveryState = "cutoff";
    f.state.transcript.at(-1).text = "Actually delivered question?";
    f.state.askedJudgeQuestions[answer.id] = "Actually delivered question?";
    f.c.primeAiPreparationForPhase(question);
    await f.settle();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].recordContext.phaseId, answer.id);
    assert.match(f.calls[0].userPrompt, /Actually delivered question/);
    assert.doesNotMatch(f.calls[0].userPrompt, /UNPLAYED_FULL_QUESTION/);
});

test("case two starts only after the last case one answer is delivered; reset/close discard late text before TTS", async () => {
    const f = fixture(), lastAnswer = f.phase("case1-judge3-answer");
    delivered(f, lastAnswer);
    f.c.primeAiPreparationForPhase(lastAnswer);
    await f.settle();
    assert.equal(f.calls[0].recordContext.phaseId, "case2-presentation");
    assert.match(f.calls[0].userPrompt, /Full second case/);
    assert.match(f.calls[0].userPrompt, /Actually heard/);
    for (const cause of ["reset", "close"]) {
        let resolve;
        const cancelled = fixture({generate: () => new Promise(done => {resolve = done;})});
        cancelled.c.primeAiPreparationForPhase(cancelled.phase("case1-moderator"));
        const pending = cancelled.settle();
        if (cause === "reset") cancelled.state.matchRunId++;
        else cancelled.state.sessionClosed = true;
        resolve("Late response would require a fresh retry.");
        await pending;
        assert.equal(cancelled.calls.length, 1);
        assert.equal(cancelled.audio.length, 0);
        assert.deepEqual(cancelled.state.aiPreparedTurns, {});
    }
});

test("moderator and conferral playback cannot contaminate or delay substantive model context", () => {
    const messages = [
        {kind: "moderator", text: "ADMIN_PRIVATE", speechDeliveryState: "pending"},
        {kind: "ai", text: "YIELD_PRIVATE", substantive: false, speechDeliveryState: "pending"},
        {kind: "ai", label: "Alex", text: "Delivered.", speechDeliveryState: "complete"}
    ];
    assert.equal(contexts.discussion({messages, phases: []}), "[Turn • Alex] Delivered.");
    messages.at(-1).speechDeliveryState = "unresolved";
    assert.throws(() => contexts.discussion({messages, phases: []}), /verified delivered transcript/);
});

test("delayed model and whole-audio work overlap a realistic full-case reading instead of starting after it", async () => {
    // Advance controllable promises on a virtual clock; no real sleeps or paid calls.
    // A 25-second model request followed by 45 seconds of TTS/alignment fits within
    // a 95-second case reading only when preparation starts during that reading.
    let now = 0;
    const jobs = [], events = [];
    const later = (seconds, value) => new Promise(resolve => jobs.push({at: now + seconds, run: () => resolve(value)}));
    const advance = async deadline => {
        while (jobs.some(job => job.at <= deadline)) {
            jobs.sort((a, b) => a.at - b.at);
            const job = jobs.shift();
            now = job.at;
            job.run();
            await new Promise(setImmediate);
        }
        now = deadline;
    };
    const f = fixture({
        generate: request => {
            events.push({kind: "generation", at: now});
            return later(25, Array(request.recordContext.wordTarget).fill("Selected").join(" "));
        },
        prepareAudio: () => {
            events.push({kind: "audio-start", at: now});
            void later(45).then(() => events.push({kind: "audio-ready", at: now}));
        }
    });
    f.c.primeAiPreparationForPhase(f.phase("case1-moderator"));
    await advance(95);
    f.state.currentPhaseIndex = f.state.phases.indexOf(f.phase("case1-presentation-confer"));
    f.c.primeAiPreparationForPhase(f.phase("case1-presentation-confer"));
    await f.settle();
    assert.deepEqual(events, [{kind: "generation", at: 0}, {kind: "audio-start", at: 25}, {kind: "audio-ready", at: 70}]);
    assert.equal(f.calls.length, 1);
    assert.equal(f.audio.length, 1);
    assert.ok(f.state.aiPreparedTurns["case1-presentation"], "selected answer is ready before conferral begins");
});

test("failed fresh retry during early preparation stays failed through phase primes until the visible conferral Retry", async () => {
    let attempts = 0;
    const f = fixture({generate: request => {
        attempts++;
        if (attempts === 2) return Promise.reject(Error("Fresh transport failed"));
        return Promise.resolve(Array(attempts === 1 ? request.recordContext.wordTarget * 2 : request.recordContext.wordTarget).fill("Selected").join(" "));
    }});
    f.c.primeAiPreparationForPhase(f.phase("case1-moderator"));
    await assert.rejects(f.settle(), /Fresh answer retry failed: Fresh transport failed/);
    assert.equal(f.calls.length, 2);
    for (const phaseId of ["case1-moderator", "case1-presentation-confer", "case1-presentation"]) {
        f.c.primeAiPreparationForPhase(f.phase(phaseId));
    }
    await assert.rejects(f.c.maybePrepareAiTurnForPhase(f.phase("case1-presentation")), /Fresh transport failed/);
    assert.equal(f.calls.length, 2, "automatic primes cannot hide failure by starting another operation");
    f.state.currentPhaseIndex = f.state.phases.indexOf(f.phase("case1-presentation-confer"));
    f.state.phaseReady = true;
    await f.c.handleNextAction();
    assert.equal(f.calls.length, 2, "first active conferral surfaces the cached background failure");
    assert.equal(f.state.autoGenerationBlockedPhaseId, "case1-presentation-confer");
    assert.match(f.statuses.at(-1)[0], /Fresh transport failed/);
    await f.c.handleNextAction(); // The enabled Retry action uses this same dispatch.
    assert.equal(f.calls.length, 3);
    assert.equal(f.audio.length, 1);
    assert.equal(f.participantMessages.length, 1);
    assert.equal(f.participantMessages[0][1], "I yield my time");
});

test("speech Retry restarts a failed operation explicitly; another automatic moderator prime cannot", async () => {
    let attempts = 0;
    const f = fixture({generate: request => {
        attempts++;
        return attempts === 1 ? Promise.reject(Error("Initial transport failed")) : Promise.resolve(Array(request.recordContext.wordTarget).fill("Selected").join(" "));
    }});
    f.c.primeAiPreparationForPhase(f.phase("case1-moderator"));
    await assert.rejects(f.settle(), /Initial transport failed/);
    const speech = f.phase("case1-presentation");
    f.state.currentPhaseIndex = f.state.phases.indexOf(speech);
    f.state.phaseReady = true;
    assert.equal(await f.c.generateAiTurnForPhase(speech, {duringModerator: true}), false);
    assert.equal(f.state.autoGenerationBlockedPhaseId, speech.id);
    assert.equal(await f.c.generateAiTurnForPhase(speech, {duringModerator: true}), false);
    assert.equal(f.calls.length, 1);
    await f.c.handleNextAction();
    assert.equal(f.calls.length, 2);
    assert.equal(f.audio.length, 1);
    assert.equal(f.participantMessages.length, 1);
});
