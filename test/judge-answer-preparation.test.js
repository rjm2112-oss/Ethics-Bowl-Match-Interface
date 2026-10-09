"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const harness = require("./helpers/renderer-harness");
const phasesApi = require("../src/shared/match-phases");
const delivery = require("../src/shared/speech-delivery");

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return {promise, resolve};
}

function fixture({locale = "en", caseNum = 1, judgeNumber = 1, humanAnswerer = false} = {}) {
    const questionResult = deferred(), answerResult = deferred();
    const requests = [], events = [], audio = [], participantMessages = [];
    const phases = phasesApi.build({leadByCase: {1: "human", 2: "ai"}, locale});
    const question = phases.find(phase => phase.id === `case${caseNum}-judge${judgeNumber}-question`);
    const answer = phases.find(phase => phase.id === `case${caseNum}-judge${judgeNumber}-answer`);
    const fullQuestion = locale === "en"
        ? "Which obligation takes priority, and how would you justify the resulting trade-off?"
        : "Quelle obligation est prioritaire, et comment justifiez-vous le compromis qui en découle ?";
    const state = {
        started: true, matchRunId: 8, phaseReady: true, locale, phases,
        judgeMode: caseNum === 1 ? "ai" : "hybrid",
        currentPhaseIndex: phases.indexOf(question),
        names: {human: "Alex", ai: "Morgan"}, participantTypes: {human: "ai", ai: "ai"},
        leadByCase: {1: "human", 2: "ai"},
        cases: {1: {title: "One", text: "Full first case.", question: "Should we?"}, 2: {title: "Two", text: "Full second case.", question: "Why?"}},
        transcript: [
            {kind: "ai", label: "Alex", caseNum: caseNum === 1 ? 2 : 1, text: "OTHER_CASE_DISCUSSION", speechDeliveryState: "complete"},
            {kind: "ai", label: "Morgan", caseNum, text: "All preceding delivered discussion.", speechDeliveryState: "complete"}
        ]
    };
    if (humanAnswerer) state.participantTypes[answer.speaker] = "human";
    let playback;
    const c = harness.load(["askAiJudgeQuestion", "maybePrepareAiTurnForPhase", "primeAiPreparationForPhase", "generateAiTurnForPhase"], {
        state, activeLocale: locale, localStorage: {getItem: () => ""},
        callAI: request => {
            requests.push(request);
            events.push(request.role === "participant" ? "answer-request" : "question-request");
            return request.role === "participant" ? answerResult.promise : questionResult.promise;
        },
        appendMessage: (kind, label, text, options) => {
            events.push("question-queued");
            const message = {kind, label, caseNum: options.caseNum, phaseId: options.phaseId};
            delivery.attach(message, text, [text]);
            playback = {message, text, options};
            return state.transcript.push(message) - 1;
        },
        appendParticipantMessage: (...args) => participantMessages.push(args),
        primeWholeSpeechAudioForPhase: (phase, text) => {
            events.push("answer-audio");
            audio.push({phaseId: phase.id, text});
        },
        prepareWholeSpeechAudioForPhase: async () => ({}),
        maybeCompletePreparedAiConferral() {}, updateComposerModeIndicator() {}, refreshControls() {},
        startTimerWithAutoSpeech: () => events.push("question-playing"),
        advancePhase: () => {
            state.currentPhaseIndex++;
            state.phaseReady = false;
            c.primeAiPreparationForPhase(answer);
        },
        setBusy: value => { state.busy = value; }, setStatus() {}, console: {error() {}}
    });
    async function ask() {
        const pending = c.askAiJudgeQuestion(question);
        assert.equal(requests.length, 1, "answer cannot begin before the complete question exists");
        questionResult.resolve({question: fullQuestion});
        assert.equal(await pending, true);
        return playback;
    }
    async function finishAnswer() {
        const pending = state.aiPreparationPromises[answer.id];
        answerResult.resolve(Array(requests.find(request => request.role === "participant").recordContext.wordTarget).fill("Selected").join(" "));
        await pending;
        await new Promise(setImmediate);
    }
    return {c, state, question, answer, fullQuestion, requests, events, audio, participantMessages, ask, finishAnswer};
}

for (const locale of ["en", "fr-ca"]) {
    for (const answerReadyDuringQuestion of [true, false]) {
        test(`${locale}: every judge answer starts before playback and is reused when ${answerReadyDuringQuestion ? "ready during" : "still pending after"} the question`, async () => {
            for (const caseNum of [1, 2]) for (const judgeNumber of [1, 2, 3]) {
                const f = fixture({locale, caseNum, judgeNumber});
                const playback = await f.ask();
                assert.deepEqual(f.events, ["question-request", "answer-request", "question-queued"]);
                assert.equal(f.requests[1].reasoningEffort, "medium");
                assert.equal(f.requests[1].recordContext.phaseId, f.answer.id);
                assert.ok(f.requests[1].userPrompt.includes(f.fullQuestion));
                assert.match(f.requests[1].userPrompt, /All preceding delivered discussion/);
                assert.ok(f.requests.every(request => !request.userPrompt.includes("OTHER_CASE_DISCUSSION")));
                assert.equal(f.state.askedJudgeQuestions[f.answer.id], f.fullQuestion);
                assert.equal(playback.text, f.fullQuestion);
                assert.equal(playback.message.text, "", "preparation does not mark an unheard question as delivered");
                assert.equal(playback.message.speechDeliveryState, "pending");
                assert.equal(f.participantMessages.length, 0, "preparing an answer cannot interrupt the judge");
                playback.options.onPlaybackStart();
                if (answerReadyDuringQuestion) {
                    await f.finishAnswer();
                    assert.equal(f.audio.length, 1, "answer audio prepares while the judge is still speaking");
                    assert.equal(f.state.phases[f.state.currentPhaseIndex], f.question);
                    assert.equal(f.participantMessages.length, 0);
                }
                // Recognition may differ in punctuation or wording. It belongs in
                // the delivered transcript, without rebinding the prepared answer.
                playback.message.text = "Recognized question wording differs.";
                playback.message.speechDeliveryState = "complete";
                playback.options.onPlaybackComplete();
                assert.equal(f.state.phases[f.state.currentPhaseIndex], f.answer);
                assert.equal(f.state.askedJudgeQuestions[f.answer.id], f.fullQuestion);
                const speaking = f.c.generateAiTurnForPhase(f.answer, {duringModerator: true});
                if (!answerReadyDuringQuestion) await f.finishAnswer();
                assert.equal(await speaking, true);
                assert.equal(f.requests.length, 2, "one judge request and one contestant request across the handoff");
                assert.equal(f.audio.length, 1);
                assert.equal(f.participantMessages.length, 1);
                assert.equal(f.participantMessages[0][1], f.audio[0].text);
                assert.deepEqual(f.state.aiPreparationErrors, {});
            }
        });
    }
}

for (const reason of ["reset", "close"]) {
    test(`${reason} discards an answer still preparing during the judge's speech`, async () => {
        const f = fixture();
        await f.ask();
        if (reason === "reset") f.state.matchRunId++;
        else f.state.sessionClosed = true;
        await f.finishAnswer();
        assert.deepEqual(f.state.aiPreparedTurns, {});
        assert.equal(f.audio.length, 0);
        assert.equal(f.participantMessages.length, 0);
        assert.equal(f.requests.length, 2);
    });
}

test("a judge question to a human participant starts no contestant API request", async () => {
    const f = fixture({humanAnswerer: true});
    const playback = await f.ask();
    assert.equal(f.requests.length, 1);
    assert.equal(playback.text, f.fullQuestion);
    assert.equal(f.audio.length, 0);
});
