"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const harness=require("./helpers/renderer-harness"),catalog=require("../src/shared/model-catalog");
const delivery=require("../src/shared/speech-delivery"),phasesApi=require("../src/shared/match-phases");
const tick=()=>new Promise(setImmediate);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture({pendingTargetAudio=false,pendingTargetRecognition=false}={}) {
    const recognition=deferred(),targetAudio=deferred(),targetRecognition=deferred();
    const calls={speech:[],recognition:[],generation:[],played:[]};
    const phases=phasesApi.build({leadByCase:{1:"human",2:"ai"},locale:"en"});
    const source=phases.find(p=>p.id==="case1-presentation"),target=phases.find(p=>p.id==="case1-commentary");
    const message={kind:"ai-alt",label:"Sol",caseNum:1,phaseId:source.id};
    delivery.attach(message,"Generated source.",["Generated source."]);
    const state={started:true,matchRunId:40,speechToken:8,phaseReady:true,phases,currentPhaseIndex:phases.indexOf(source),
        participantTypes:{human:"ai",ai:"ai"},names:{human:"Sol",ai:"Opus"},leadByCase:{1:"human",2:"ai"},
        cases:{1:{title:"A case",text:"Case narrative.",question:"Should they?"}},transcript:[message],
        timingTestAudioContext:{state:"running",decodeAudioData:async()=>({duration:8})}};
    const audio={currentTime:0,duration:8,ended:false,paused:true,played:{length:1,start:()=>0,end:()=>audio.currentTime},play(){calls.audioPlays=(calls.audioPlays||0)+1;this.paused=false;return Promise.resolve();},pause(){},load(){},removeAttribute(){}};
    state.speechAudioEl=audio;
    const c=harness.load(["prepareWholeSpeechAudioForPhase","enqueuePreparedWholeSpeech","stopSpeechPlayback","getPreparedAiTurnText","generateAiTurnForPhase"],{
        state,AUDIO_MODELS:catalog.AUDIO_MODELS,AUTO_SPEAK_VOICES:{ai:"shimmer","ai-alt":"alloy"},
        WHOLE_SPEECH_TTS_CONCURRENCY:2,WHOLE_SPEECH_MIN_PLAYBACK_RATE:.924,WHOLE_SPEECH_MAX_PLAYBACK_RATE:1.09,TIMED_SPEECH_TIMER_LEAD_MS:350,
        hasCredential:()=>true,callAI:async request=>{calls.generation.push(request);return Array(request.recordContext.wordTarget).fill("Selected").join(" ");},
        maybeCompletePreparedAiConferral(){},ensureSpeechAudioEl:()=>audio,refreshSpeechUi(){},clearTimingTestAudioCache(){},resetSpeechProgressState(){},
        ensureSpeechUi(){},beginSpeechProgressForQueueEntry(){},queueSpeechFollowScroll(){},syncSpeechProgressToUi(){},renderTranscript(){},finishSpeechProgressPlayback(){},invokeSpeechStartCallbacks(){},restoreMessageBodyPlainText(){},waitMs:async()=>{},
        setBusy(){},setStatus(){},refreshControls(){},updateComposerModeIndicator(){},appendParticipantMessage:(...args)=>calls.played.push(args),console:{info(){},warn(){},error(){}},
        window:{AudioContext:class {},ethicsApi:{audio:{
            speech:async request=>{calls.speech.push(request);return request.recordContext.phaseId===target.id&&pendingTargetAudio?targetAudio.promise:{bytes:[1,2],mimeType:"audio/mpeg"};},
            transcribe:async()=>{},alignSpeech:request=>{calls.recognition.push(request);return request.originalText==="Generated source."?recognition.promise:
                pendingTargetRecognition?targetRecognition.promise:Promise.resolve({transcriptText:"Recognized prepared response.",alignment:null});},recordSpeechEvent:async()=>{}
        }}}
    });
    const prepare=()=>c.prepareWholeSpeechAudioForPhase(source,"Generated source.");
    const recognize=async()=>{recognition.resolve({transcriptText:"Actual recognized source.",alignment:null});await tick();};
    const targetReady=async()=>{await Promise.all(Object.values(state.aiPreparationPromises));return state.wholeSpeechPreparations.get(target.id)?.promise;};
    const stop=reason=>c.stopSpeechPlayback(false,{resolveCallbacks:false,deliveryReason:reason});
    return {c,state,source,target,message,audio,calls,recognition,targetAudio,targetRecognition,prepare,recognize,targetReady,stop};
}

test("real audio preparation starts the next request from delayed recognition without blocking source readiness",async()=>{
    const f=fixture(),record=await f.prepare();
    assert.equal(f.calls.speech.length,1);assert.equal(f.calls.generation.length,0);assert.equal(f.calls.recognition.length,1);
    // Playback consumes the prepared chunks before asynchronous ASR completes.
    f.state.wholeSpeechPreparations.delete(f.source.id);record.consumed=true;record.preparedChunks=[];
    await f.recognize();await record.predictionPromise;const next=await f.targetReady();
    assert.equal(f.calls.generation.length,1);assert.match(f.calls.generation[0].userPrompt,/Actual recognized source/);
    assert.doesNotMatch(f.calls.generation[0].userPrompt,/Generated source/);assert.ok(next);
    await next.predictionPromise;assert.equal(f.calls.generation.length,1,"prepared future audio cannot recursively prepare another answer");
    assert.equal(f.message.text,"");assert.equal(f.c.getPreparedAiTurnText(f.target.id),"");
    await f.stop("reset");
});

for(const boundary of ["ready","pending speech","pending recognition"])test(`timeout preserves ${boundary} audio for the next participant without another request`,async()=>{
    const f=fixture({pendingTargetAudio:boundary==="pending speech",pendingTargetRecognition:boundary==="pending recognition"});
    await f.prepare();await f.recognize();
    const next=f.state.wholeSpeechPreparations.get(f.target.id);assert.ok(next);assert.equal(f.calls.speech.length,2);
    await f.stop("timeout");
    assert.equal(f.state.wholeSpeechPreparations.get(f.target.id),next);assert.equal(next.released,false);
    f.targetAudio.resolve({bytes:[1,2],mimeType:"audio/mpeg"});
    f.targetRecognition.resolve({transcriptText:"Recognized prepared response.",alignment:null});
    assert.equal(await next.promise,next);await next.predictionPromise;
    assert.equal(next.preparedChunks[0].prepared.wordAlignment.transcriptText,"Recognized prepared response.");
    const before={speech:f.calls.speech.length,recognition:f.calls.recognition.length,generation:f.calls.generation.length};
    const text=f.c.getPreparedAiTurnText(f.target.id);assert.ok(text);
    assert.equal(await f.c.prepareWholeSpeechAudioForPhase(f.target,text),next);
    f.state.currentPhaseIndex=f.state.phases.indexOf(f.target);f.state.phaseReady=true;
    assert.equal(await f.c.generateAiTurnForPhase(f.target,{duringModerator:true}),true);
    assert.deepEqual({speech:f.calls.speech.length,recognition:f.calls.recognition.length,generation:f.calls.generation.length},before);
    assert.equal(f.calls.played.length,1);await f.stop("reset");
});

for(const reason of ["reset","closed","stopped","error"])test(`${reason} discards future audio still being generated`,async()=>{
    const f=fixture({pendingTargetAudio:true});await f.prepare();await f.recognize();
    const next=f.state.wholeSpeechPreparations.get(f.target.id);assert.ok(next);
    await f.stop(reason);f.targetAudio.resolve({bytes:[1,2],mimeType:"audio/mpeg"});
    assert.equal(await next.promise,null);assert.equal(next.released,true);assert.equal(f.state.wholeSpeechPreparations.size,0);
    assert.equal(f.calls.recognition.length,1,"stale synthesis cannot initiate another recognition call");
});

for(const reason of ["timeout","reset","closed"])test(`${reason} prevents late source recognition from starting a speculative request`,async()=>{
    const f=fixture(),record=await f.prepare();await f.stop(reason);await f.recognize();await record.predictionPromise;
    assert.equal(f.calls.generation.length,0);assert.equal(f.state.speechContextPredictions.size,0);
});

test("replaced audio cannot publish a stale source prediction",async()=>{
    const f=fixture(),record=await f.prepare();
    await f.c.prepareWholeSpeechAudioForPhase(f.source,"Replacement source.");
    await f.recognize();await record.predictionPromise;
    assert.equal(f.calls.generation.length,0);assert.equal(record.released,true);
    assert.notEqual(f.state.speechContextPredictions.get(f.source.id)?.text,"Actual recognized source.");await f.stop("reset");
});

test("queued audio retained across timeout accepts late recognition with its new playback token",async()=>{
    const f=fixture({pendingTargetRecognition:true});await f.prepare();await f.recognize();const next=await f.targetReady();
    await f.stop("timeout");f.state.currentPhaseIndex=f.state.phases.indexOf(f.target);f.state.participantTypes.human="human";
    const text=f.c.getPreparedAiTurnText(f.target.id),message={kind:"ai",label:"Opus",caseNum:1,phaseId:f.target.id};
    delivery.attach(message,text,next.entries.map(entry=>entry.text));f.state.transcript.push(message);
    f.c.enqueuePreparedWholeSpeech("ai",text,f.state.transcript.length-1,"ai",{speechStartLeadMs:350},f.target);
    await tick();await tick();assert.equal(next.consumed,true);assert.equal(next.speechToken,f.state.speechToken);assert.equal(f.calls.audioPlays,1);
    f.targetRecognition.resolve({transcriptText:"Recognized prepared response.",alignment:null});await next.predictionPromise;
    f.audio.currentTime=8;f.audio.ended=true;f.audio.onended();await tick();await tick();
    assert.equal(message.speechDeliveryState,"complete");assert.equal(message.text,"Recognized prepared response.");
    assert.equal(f.calls.speech.length,2);assert.equal(f.calls.recognition.length,2);assert.equal(f.calls.generation.length,1);await f.stop("reset");
});
