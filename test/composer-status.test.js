"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { deriveStatus } = require("../src/shared/composer-status");

function snapshot(extra = {}) {
    return { started: true, phaseReady: true, matchRunId: 4, phase: { id: "answer-1", kind: "judgeAnswer", speaker: "ai", duration: 140 }, actor: "Blair", judge: "Judge 2", judgeMode: "ai", speakerIsAi: false, ...extra };
}

test("phase matrix uses actual participant control and judge mode in both languages", () => {
    let checked = 0;
    for (const locale of ["en", "fr-ca"]) for (const one of ["human", "ai"]) for (const two of ["human", "ai"]) for (const judgeMode of ["human", "ai", "hybrid"]) {
        for (const speaker of ["human", "ai"]) for (const kind of ["moderatorCase", "confer", "speech", "judgeQuestion", "judgeAnswer", "scoring", "closing"]) {
            const speakerIsAi = (speaker === "human" ? one : two) === "ai";
            const phase = { id: `${speaker}-${kind}`, speaker, kind, subtype: "presentation", duration: kind === "closing" ? null : 140 };
            const expected = (["speech", "judgeAnswer"].includes(kind) && !speakerIsAi) || (kind === "judgeQuestion" && judgeMode === "human");
            const base = snapshot({ locale, judgeMode, speakerIsAi, phase });
            const ready = deriveStatus(base);
            assert.equal(ready.inputInvited, expected, `${locale}/${one}/${two}/${judgeMode}/${speaker}/${kind}`);
            assert.equal(ready.hintVisible, kind === "judgeQuestion" && judgeMode === "human");
            assert.ok(ready.text.length);
            for (const extra of [{phaseReady:false}, {busy:true}, {awaitingPlayback:true}, {playing:true}, {timerExpired:true}, {completed:true}, {voiceFinalizePending:true}]) {
                assert.equal(deriveStatus({...base,...extra}).inputInvited,false);
            }
            checked++;
        }
    }
    assert.equal(checked, 336);
});

test("recording and transcription override type invitations and old event notices", () => {
    const base = snapshot({ judgeMode:"human", phase:{id:"q2",kind:"judgeQuestion"}, actor:"Alex" });
    const old = { phaseId:"q2",matchRunId:4,error:false,text:"Judge 2 is active. Finish typing." };
    const recording = deriveStatus({...base,isRecording:true,notice:old});
    assert.equal(recording.key,"recording"); assert.match(recording.hint,/Recording question/); assert.equal(recording.hintActive,false);
    const stopping = deriveStatus({...base,voiceFinalizePending:true,notice:old});
    assert.equal(stopping.key,"transcribing"); assert.match(stopping.hint,/Finalizing transcript/); assert.doesNotMatch(stopping.text,/Finish typing/);
    const timeout = deriveStatus({...base,voiceFinalizePending:true,pendingSubmitReason:"timeout"});
    assert.match(timeout.text,/Time is up.*before submission/);
    const submitting = deriveStatus({...base,voiceFinalizePending:true,pendingSubmitReason:"manual"});
    assert.match(submitting.text,/before submission/);
    assert.match(deriveStatus({...base,awaitingPlayback:true}).hint,/Preparing question audio/);
    assert.match(deriveStatus({...base,playing:true}).hint,/Reading question/);
});

test("generated or submitted text is not presented as finished while audio is pending or playing", () => {
    const base = snapshot({speakerIsAi:true,notice:{phaseId:"answer-1",matchRunId:4,error:false,text:"Blair has finished."}});
    assert.equal(deriveStatus({...base,awaitingPlayback:true}).key,"audio-preparing");
    const playing = deriveStatus({...base,awaitingPlayback:true,playing:true,reader:"Blair"});
    assert.equal(playing.key,"playback"); assert.match(playing.text,/Blair.*in progress/); assert.doesNotMatch(playing.text,/has finished/);
    assert.equal(deriveStatus({...base,preparing:true}).key,"preparing");
    assert.equal(deriveStatus({...base,prepared:true}).key,"ai-ready");
});

test("timer pause and audio pause describe different states", () => {
    const reading = deriveStatus(snapshot({playing:true,reader:"Judge 2",timerPaused:true}));
    assert.equal(reading.key,"playback"); assert.match(reading.text,/read-aloud in progress.*Timer paused/);
    assert.equal(deriveStatus(snapshot({playbackPaused:true})).key,"playback-paused");
    assert.equal(deriveStatus(snapshot({timerExpired:true,playing:true})).key,"timeout");
    assert.match(deriveStatus(snapshot({phaseReady:false,playbackPaused:true})).text,/Moderator read-aloud paused/);
    assert.doesNotMatch(deriveStatus(snapshot({phaseReady:false,playing:true,speakerIsAi:true})).text,/Input activates/);
    assert.match(deriveStatus(snapshot({phaseReady:false,playing:true,speakerIsAi:false})).text,/Input activates after/);
});

test("errors persist in their phase, clear on transitions/restart, and give way during retry", () => {
    const notice = {phaseId:"answer-1",matchRunId:4,error:true,text:"Microphone permission denied."};
    const base = snapshot({notice});
    assert.equal(deriveStatus(base).error,true); assert.match(deriveStatus(base).text,/Microphone permission denied/);
    assert.equal(deriveStatus({...base,phase:{id:"answer-2",kind:"judgeAnswer"}}).error,false);
    assert.equal(deriveStatus({...base,matchRunId:5}).error,false);
    for (const extra of [{busy:true},{isRecording:true},{voiceFinalizePending:true},{completed:true}]) assert.equal(deriveStatus({...base,...extra}).error,false);
    const blocked = deriveStatus({...base,speakerIsAi:true,generationBlocked:true,retryLabel:"Generate AI Answer"});
    assert.equal(blocked.key,"retry"); assert.match(blocked.text,/Generate AI Answer.*retry/);
    assert.equal(deriveStatus(snapshot({voiceFinalizePending:false,notice})).inputInvited,true);
});

test("setup, coin choice, completion, announcements and human scoring never invite composer input", () => {
    assert.equal(deriveStatus({}).key,"setup");
    assert.equal(deriveStatus({busy:true}).key,"setup-busy");
    assert.equal(deriveStatus(snapshot({coinTossAnimating:true})).key,"coin-toss");
    const coin = deriveStatus(snapshot({waitingForCoinChoice:true,coinWinner:"Blair"})); assert.match(coin.text,/Blair.*Lead or Pass/);
    assert.equal(deriveStatus(snapshot({phase:null})).key,"no-phase");
    const announcement = deriveStatus(snapshot({phaseReady:false,playing:false,audioPending:true})); assert.match(announcement.text,/Preparing.*announcement/);
    for (const judgeMode of ["human","hybrid"]) {
        const closing = deriveStatus(snapshot({phase:{id:"closing",kind:"closing"},judgeMode})); assert.match(closing.text,/all three judges/); assert.doesNotMatch(closing.text,/AI judges/);
        const scoring = deriveStatus(snapshot({phase:{id:"scoring",kind:"scoring"},judgeMode})); assert.match(scoring.text,/Human judges/);
    }
});

test("the actual 29-phase match includes both cases, every speech subtype and all three judges", () => {
    const phases=require("../src/shared/match-phases").build({leadByCase:{1:"human",2:"ai"}});assert.equal(phases.length,29);
    const seen=new Set();
    for(const phase of phases) for(const locale of ["en","fr-ca"]) for(const one of ["human","ai"]) for(const two of ["human","ai"]) for(const judgeMode of ["human","ai","hybrid"]) {
        const speakerIsAi=(phase.speaker==="human"?one:two)==="ai";
        const model=deriveStatus(snapshot({phase,locale,speakerIsAi,judgeMode}));
        const humanInput=(["speech","judgeAnswer"].includes(phase.kind)&&!speakerIsAi)||(phase.kind==="judgeQuestion"&&judgeMode==="human");
        assert.equal(model.inputInvited,humanInput,`${phase.id}/${locale}/${one}/${two}/${judgeMode}`);
        if(phase.kind==="speech") {seen.add(phase.subtype);if(humanInput&&locale==="en")assert.ok(model.text.includes(phase.subtype));}
        if(phase.kind==="judgeQuestion")seen.add(`judge${phase.judgeNumber}`);
    }
    assert.deepEqual([...seen].sort(),["commentary","judge1","judge2","judge3","presentation","response"]);
    assert.doesNotMatch(deriveStatus(snapshot({isRecording:true,submissionAllowed:false})).text,/submit to stop/);
});
