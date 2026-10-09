const rendererHarness=require("./helpers/renderer-harness");
const declaration=rendererHarness.declaration;
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = rendererHarness.source();

function load(names, globals) {
    const context = vm.createContext({...globals,ACTIVE_SPEECH_DELIVERY:globals.SPEECH_DELIVERY});
    rendererHarness.install(context,names);
    return context;
}
function scoringFixture() {
    let transcript = "Delivered original answer";
    const requests = [], pending = [];
    const state = {judgeMode:"ai", matchRunId:1, transcript:[], aiFinalJudgeScorecards:{}, aiFinalJudgeScoringPromises:{}, aiFinalJudgeScoringErrors:{}};
    const context = load(["maybePrepareAiFinalJudgeScorecard", "primeAiFinalScoringPreparationForPhase"], {
        state, console, usesAiFinalScoring:()=>true, l:en=>en, sanitizeText:value=>String(value).trim(),
        publishJudgeScorecard:()=>{}, scoringTranscriptAsPlainText:()=>transcript,
        buildAiSingleJudgeScoringPrompt:text=>text, buildAiScoringSystemPrompt:()=>"Approved rules unchanged",
        getJudgeModel:()=>"mock", FINAL_SCORECARD_REQUEST_TIMEOUT_MS:180000, JUDGE_REASONING_EFFORT:"high", FINAL_JUDGE_SCORECARD_JSON_SCHEMA:{},
        normalizeAiFinalJudgeScorecardResponse:(raw,n)=>({judgeNumber:n, ...raw}),
        callAI:request=>{requests.push(request); return new Promise((resolve,reject)=>pending.push({resolve,reject}));}
    });
    return {state,context,requests,pending,setTranscript:text=>{transcript=text;}};
}
test("final-turn entry and playback start never prefetch scores", ()=>{
    const fixture=scoringFixture();
    fixture.context.primeAiFinalScoringPreparationForPhase({kind:"judgeAnswer",caseNum:2});
    assert.equal(fixture.requests.length,0);
    const generated=declaration("generateAiTurnForPhase");
    assert.doesNotMatch(generated,/primeAiFinalScoringAfterFinalTurn/);
});
test("all judges reject pending, interrupted or simulated speech before sending any request", async()=>{
    for(const status of ["pending","unresolved","simulated"]){
        const f=scoringFixture();f.state.transcript=[{text:"UNSPOKEN_TAIL",speechDeliveryState:status}];
        for(const judge of [1,2,3]) await assert.rejects(f.context.maybePrepareAiFinalJudgeScorecard(judge),/verified delivered transcript/);
        assert.equal(f.requests.length,0);
    }
});
test("completed playback permits unchanged scoring content and reuses only the matching snapshot",async()=>{
    const f=scoringFixture();f.state.transcript=[{text:"Delivered original answer",speechDeliveryState:"complete"}];
    const one=f.context.maybePrepareAiFinalJudgeScorecard(1);f.pending[0].resolve({humanScore:40,aiScore:41});
    const card=await one;assert.equal(card.humanScore,40);
    assert.equal(f.requests[0].userPrompt,"Delivered original answer");
    assert.equal(f.requests[0].systemPrompt,"Approved rules unchanged");
    assert.equal(await f.context.maybePrepareAiFinalJudgeScorecard(1),card);
    assert.equal(f.requests.length,1);
    f.setTranscript("Verified changed answer");
    const two=f.context.maybePrepareAiFinalJudgeScorecard(1);assert.equal(f.requests.length,2);
    assert.equal(f.state.aiFinalJudgeScorecards[1],undefined);
    f.pending[1].resolve({humanScore:39,aiScore:40});await two;
});
test("a transcript change during scoring discards the old result and allows a fresh request",async()=>{
    const f=scoringFixture();const old=f.context.maybePrepareAiFinalJudgeScorecard(1);
    f.setTranscript("Updated delivered prefix");const fresh=f.context.maybePrepareAiFinalJudgeScorecard(1);
    f.pending[0].resolve({humanScore:60,aiScore:60});assert.equal(await old,null);
    assert.equal(f.state.aiFinalJudgeScorecards[1],undefined);
    f.pending[1].resolve({humanScore:40,aiScore:40});assert.equal((await fresh).humanScore,40);
    assert.equal(f.requests[1].userPrompt,"Updated delivered prefix");
});
test("cutoff or match reset during scoring cannot cache a stale result",async()=>{
    for(const cause of ["cutoff","reset"]){
        const f=scoringFixture();const request=f.context.maybePrepareAiFinalJudgeScorecard(2);
        if(cause==="cutoff")f.state.transcript.push({speechDeliveryState:"unresolved"});else f.state.matchRunId++;
        f.pending[0].resolve({humanScore:60,aiScore:60});assert.equal(await request,null);
        assert.equal(f.state.aiFinalJudgeScorecards[2],undefined);
    }
});
test("a replaced request's failure cannot replace a newer scoring error/result",async()=>{
    const f=scoringFixture();const old=f.context.maybePrepareAiFinalJudgeScorecard(1);
    const rejected=assert.rejects(old,/old failure/);
    f.setTranscript("Changed transcript");const fresh=f.context.maybePrepareAiFinalJudgeScorecard(1);
    f.pending[0].reject(new Error("old failure"));await rejected;
    assert.equal(f.state.aiFinalJudgeScoringErrors[1],undefined);
    f.pending[1].resolve({humanScore:41,aiScore:42});await fresh;
});
test("chunk callbacks alone cannot certify delivery, including in timing mode",()=>{
    for(const timingMode of [false,true]){
        const state={transcript:[{speechDeliveryState:"pending"}],speechChunkCounts:new Map([[0,2]])};let completed=0;
        state.speechCompletionCallbacks=new Map([[0,[()=>completed++]]]);
        const c=load(["markSpeechChunkComplete"],{window:{setTimeout:callback=>callback()},state,SPEECH_DELIVERY:require("../src/shared/speech-delivery"),TIMING_TEST_MODE:timingMode,invokeSpeechCompletionCallbacks:()=>completed++});
        c.markSpeechChunkComplete(0);assert.equal(state.transcript[0].speechDeliveryState,"pending");assert.equal(completed,0);
        c.markSpeechChunkComplete(0);assert.equal(state.transcript[0].speechDeliveryState,"unresolved");assert.equal(completed,1);
        state.transcript[0].speechDeliveryState="unresolved";c.markSpeechChunkComplete(0);assert.equal(state.transcript[0].speechDeliveryState,"unresolved");
    }
});
test("stopping speech marks unresolved before callbacks and invalidates existing score work",()=>{
    const state={transcript:[{speechDeliveryState:"pending"},{speechDeliveryState:"complete"}],speechToken:2,speechQueue:[],wholeSpeechPendingTranscriptIndexes:new Set(),timingTestMeasurements:new Map(),speechChunkCounts:new Map(),speechStartCallbacks:new Map(),speechCompletionCallbacks:new Map(),aiFinalJudgeScorecards:{1:{humanScore:60}},aiFinalJudgeScoringPromises:{1:{}},aiFinalJudgeScoringErrors:{1:"old"}};
    require("../src/shared/speech-delivery").attach(state.transcript[0],"Private speech.",["Private speech."]);
    let callbacks=false;
    state.speechAudioEl={pause(){},load(){},removeAttribute(){}};
    const c=load(["stopSpeechPlayback"],{state,document:{body:{contains:()=>true}},SPEECH_DELIVERY:require("../src/shared/speech-delivery"),
        captureActiveSpeechDelivery:()=>{},revokeQueuedPreparedSpeechAudio:()=>{},clearAllWholeSpeechPreparations:()=>{},clearOpenAiSpeechLookahead:()=>{},clearTimingTestAudioCache:()=>{},rejectCurrentSpeechPlayback:()=>{},resetSpeechAudioEl:()=>{},resetSpeechProgressState:()=>{},refreshSpeechUi:()=>{},
        finalizeAllSpeechPlaybackCallbacks:()=>{callbacks=true;assert.equal(state.transcript[0].speechDeliveryState,"unresolved");assert.equal(Object.keys(state.aiFinalJudgeScorecards).length,0);}
    });
    c.stopSpeechPlayback(false,{deliveryReason:"error"});assert.equal(callbacks,true);assert.equal(state.speechToken,3);assert.equal(state.transcript[1].speechDeliveryState,"complete");assert.equal(Object.keys(state.aiFinalJudgeScoringPromises).length,0);
});
test("timeout freezes typed draft and preserves delayed captured speech, excluding later edits",()=>{
    for(const recording of [false,true]){
        const phase={id:"human-answer"},input={value:"Original draft"},submitted=[];
        const state={isRecording:recording,voiceFinalizePending:false,draftBeforeRecording:"Original draft",completed:false};
        const c=load(["clearPendingVoiceSubmission","setPendingVoiceSubmission","resolvePendingVoiceSubmission","applyVoiceInputResult"],{
            state,getCurrentPhase:()=>phase,getComposerDraftTextForPhase:()=>input.value,
            commitMainComposerSubmission:(p,text)=>{submitted.push(text);return true;},
            isHumanJudgeQuestionPhase:()=>false,messageInputEl:input,setStatus:()=>{},l:en=>en,concludeTimedOutHumanPhase:()=>{},
            combineDraftAndSpeech:(draft,speech)=>[draft,speech].filter(Boolean).join(" "),syncActiveJudgeDraftFromMainComposer:()=>{}
        });
        c.setPendingVoiceSubmission("timeout",phase.id);input.value="UNSPOKEN later draft";
        if(recording)c.applyVoiceInputResult("Captured before stop", "Ready");
        c.resolvePendingVoiceSubmission();assert.equal(submitted[0],recording?"Original draft Captured before stop":"Original draft");
        assert.doesNotMatch(submitted[0],/UNSPOKEN/);assert.equal(state.pendingVoiceSubmission,null);
    }
});
test("a captured voice submission from a previous phase is never committed",()=>{
    const state={pendingVoiceSubmission:{phaseId:"old",reason:"timeout",capturedDraft:"Old captured speech"}};
    const c=load(["clearPendingVoiceSubmission","resolvePendingVoiceSubmission"],{state,getCurrentPhase:()=>({id:"new"}),commitMainComposerSubmission:()=>assert.fail("stale submission")});
    assert.equal(c.resolvePendingVoiceSubmission(),false);assert.equal(state.pendingVoiceSubmission,null);
});


test("final judges receive an aligned cutoff prefix and never the private generated tail",async()=>{
    const f=scoringFixture(),delivery=require("../src/shared/speech-delivery"),alignment=require("../src/shared/word-alignment");
    const message={};delivery.attach(message,"Delivered answer. UNSPOKEN_TAIL",["Delivered answer. UNSPOKEN_TAIL"]);
    delivery.beginSpokenCutoff(message);
    delivery.finalizeSpokenCutoff(message,"Delivered answer.");
    f.state.transcript=[message];f.setTranscript(message.text);
    const score=f.context.maybePrepareAiFinalJudgeScorecard(1);
    assert.equal(f.requests[0].userPrompt,"Delivered answer.");assert.doesNotMatch(f.requests[0].userPrompt,/UNSPOKEN/);
    f.pending[0].resolve({humanScore:20,aiScore:21});await score;
});

test("unsupported-schema 400 is not resubmitted unchanged; changed request may retry and successful cards are retained",async()=>{
 const f=scoringFixture();const first=f.context.maybePrepareAiFinalJudgeScorecard(1);f.pending[0].reject(Error("The AI provider rejected the request (HTTP 400): Unsupported schema minimum"));await assert.rejects(first,/HTTP 400/);
 await assert.rejects(f.context.maybePrepareAiFinalJudgeScorecard(1),/HTTP 400/);assert.equal(f.requests.length,1);
 f.setTranscript("Changed delivered context");const fresh=f.context.maybePrepareAiFinalJudgeScorecard(1);assert.equal(f.requests.length,2);f.pending[1].resolve({humanScore:40,aiScore:41});const card=await fresh;
 assert.equal(await f.context.maybePrepareAiFinalJudgeScorecard(1),card);assert.equal(f.requests.length,2);
});
