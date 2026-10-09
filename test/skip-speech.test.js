"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{load}=require("./helpers/renderer-harness");
const delivery=require("../src/shared/speech-delivery");
const tick=()=>new Promise(setImmediate);
function fixture({remaining=40,recognition=Promise.resolve({transcriptText:"First recognized sentence."})}={}){
    const phase={id:"case1-response",kind:"speech",subtype:"response",duration:180};
    const message={kind:"ai",phaseId:phase.id};delivery.attach(message,"First draft. Second draft.",["First draft.","Second draft."]);
    const audio={currentTime:0,duration:10,paused:true,ended:false,played:{length:1,start:()=>0,end:()=>audio.currentTime},play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},load(){},removeAttribute(){}};
    const events=[],expired=[],future={phaseId:"case2-presentation",preparedChunks:[],consumed:false,released:false};
    const state={started:true,matchRunId:4,speechToken:2,phaseReady:true,phases:[phase],currentPhaseIndex:0,transcript:[message],speechAudioEl:audio,
        timer:{phaseId:phase.id,remaining,running:true,lastTickAtMs:0},wholeSpeechPreparations:new Map([[future.phaseId,future]])};
    const c=load(["processSpeechQueue","skipCurrentSpeech","canSkipCurrentSpeech","stopSpeechPlayback"],{state,
        WHOLE_SPEECH_MIN_PLAYBACK_RATE:.924,WHOLE_SPEECH_MAX_PLAYBACK_RATE:1.09,
        ensureSpeechAudioEl:()=>audio,refreshSpeechUi(){},queueSpeechFollowScroll(){},renderTranscript(){},syncSpeechProgressToUi(){},beginSpeechProgressForQueueEntry(){},finishSpeechProgressPlayback(){},waitMs:async()=>{},
        clearTimingTestAudioCache(){},resetSpeechProgressState(){},setStatus(){},timerDisplayEl:{textContent:""},
        handleTimedPhaseExpiration:p=>expired.push({phase:p,through:state.currentSpeechRecordPlayback.skipPlaybackThrough}),
        window:{performance:{now:()=>250},ethicsApi:{audio:{recordSpeechEvent:async event=>events.push(event)}}}});
    c.state.speechChunkCounts.set(0,2);
    c.state.speechQueue=["First draft.","Second draft."].map((text,index)=>({kind:"ai",phaseId:phase.id,transcriptIndex:0,chunkIndex:index,chunkCount:2,text,playbackRate:1,
        preparedAudio:{audioUrl:"blob:chunk"+index,audioBytes:[1],naturalDurationSeconds:10,wordAlignmentPromise:index?Promise.resolve({transcriptText:"Second recognized sentence."}):recognition}}));
    return {c,state:c.state,message,audio,events,expired,future};
}
test("Skip speech completes only the current message from recognition and preserves future preparation",async()=>{
    const f=fixture(),pending=f.c.processSpeechQueue();await tick();f.audio.currentTime=2;
    assert.equal(f.c.skipCurrentSpeech(),true);assert.equal(f.c.skipCurrentSpeech(),false);await pending;
    assert.equal(f.message.text,"First recognized sentence. Second recognized sentence.");
    assert.equal(f.message.speechDeliveryState,"complete");assert.equal(f.message.speechPlaybackSkipped,true);
    assert.equal(f.state.timer.remaining,22);assert.equal(f.state.speechToken,2);assert.equal(f.state.skipSpeechTranscriptIndex,-1);
    assert.equal(f.state.wholeSpeechPreparations.get(f.future.phaseId),f.future);assert.equal(f.future.released,false);
    assert.equal(f.expired.length,0);assert.equal(f.events.filter(e=>e.event==="playback_skipped").length,2);
    assert.equal(f.events.filter(e=>e.event==="playback_ended").length,0);
});
test("Skip speech uses the normal time limit at the exact remaining audio position",async()=>{
    const f=fixture({remaining:3}),pending=f.c.processSpeechQueue();await tick();f.audio.currentTime=2;
    f.c.skipCurrentSpeech();await tick();await tick();
    assert.equal(f.expired.length,1);assert.equal(f.expired[0].through,4.75);
    assert.equal(f.state.timer.remaining,0);assert.equal(f.message.speechDeliveryState,"pending");
    assert.doesNotMatch(f.message.text,/Second/);
    await f.c.stopSpeechPlayback(false,{resolveCallbacks:false,deliveryReason:"reset"});await pending;
});
test("pausing the match clock does not let Skip speech bypass its remaining time",async()=>{
    const f=fixture({remaining:3});f.state.timer.running=false;
    const pending=f.c.processSpeechQueue();await tick();f.audio.currentTime=2;
    f.c.skipCurrentSpeech();await tick();await tick();
    assert.equal(f.expired.length,1);assert.equal(f.expired[0].through,5);
    await f.c.stopSpeechPlayback(false,{resolveCallbacks:false,deliveryReason:"reset"});await pending;
});
test("Skip speech never cancels pending generation or accepts stale recognition after reset",async()=>{
    let recognize;const f=fixture({recognition:new Promise(resolve=>{recognize=resolve;})});
    assert.equal(f.c.skipCurrentSpeech(),false);
    const pending=f.c.processSpeechQueue();await tick();f.c.skipCurrentSpeech();
    assert.equal(f.audio.paused,false,"existing playback continues while its recognition is pending");
    await f.c.stopSpeechPlayback(false,{resolveCallbacks:false,deliveryReason:"reset"});
    recognize({transcriptText:"Late text."});await pending;await tick();
    assert.equal(f.message.speechDeliveryState,"unresolved");assert.doesNotMatch(f.message.text,/Late/);assert.equal(f.expired.length,0);
});
test("fractional time saved by skipping displays a whole clock and keeps thresholds",()=>{
    const c=load(["formatClock","remainingPhaseSeconds","consumeSkippedSpeechSeconds"],{state:{timer:{remaining:61,running:true,lastTickAtMs:1000}},window:{performance:{now:()=>1400}},timerDisplayEl:{textContent:""}});
    assert.equal(c.remainingPhaseSeconds(),60.6);c.consumeSkippedSpeechSeconds(1.5);
    assert.equal(c.state.timer.remaining,59.5);assert.equal(c.formatClock(c.state.timer.remaining),"01:00");assert.equal(c.remainingPhaseSeconds(),59.1);
});
