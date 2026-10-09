"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const harness = require("./helpers/renderer-harness"), catalog = require("../src/shared/model-catalog");
const delivery = require("../src/shared/speech-delivery"), contextPolicy = require("../src/shared/transcript-context");
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture() {
    const recognition = deferred(), calls = { speech:0, recognition:0, decode:0, play:0, requests:[] };
    const phase = { id:"presentation", kind:"speech", speaker:"ai", caseNum:1, duration:300 };
    const audio = { currentTime:0, duration:2, ended:false, paused:true, played:{length:1,start:()=>0,end:()=>audio.currentTime},
        play() { calls.play++; this.paused = false; return Promise.resolve(); }, pause() {}, load() {}, removeAttribute() {} };
    const state = { matchRunId:8, speechToken:4, phases:[phase], currentPhaseIndex:0,
        timingTestAudioContext:{state:"running",decodeAudioData:async()=>{calls.decode++;return {duration:2};}} };
    const c = harness.load(["prepareWholeSpeechAudioForPhase","fetchOpenAiSpeechAudio","playPreparedOpenAiSpeechChunk","stopSpeechPlayback"], {
        state, AUDIO_MODELS:catalog.AUDIO_MODELS, AUTO_SPEAK_VOICES:{ai:"shimmer"},
        WHOLE_SPEECH_TTS_CONCURRENCY:2, WHOLE_SPEECH_MIN_PLAYBACK_RATE:.924, WHOLE_SPEECH_MAX_PLAYBACK_RATE:1.09,
        getPhaseById:()=>phase, getParticipantModel:()=>catalog.DEFAULT_PARTICIPANT_MODEL,
        getWholeSpeechDescriptorForPhase:()=>({kind:"ai",voiceKey:"ai"}), hasCredential:()=>true,
        ensureSpeechAudioEl:()=>audio, refreshSpeechUi(){}, queueSpeechFollowScroll(){}, invokeSpeechStartCallbacks(){}, renderTranscript(){}, syncSpeechProgressToUi(){},
        console:{info(){},error(){},warn(){}},
        window:{AudioContext:class {},ethicsApi:{audio:{speech:async request=>{calls.speech++;calls.requests.push(request);return {bytes:[1,2],mimeType:"audio/mpeg"};},
            transcribe:async()=>{},alignSpeech:()=>{calls.recognition++;return recognition.promise;},recordSpeechEvent:async()=>{}}}}
    });
    return {c,state,phase,audio,recognition,calls};
}
async function ready(f) {
    const record = await f.c.prepareWholeSpeechAudioForPhase(f.phase,"Selected complete speech.",{kind:"ai",voiceKey:"ai"});
    const prepared = record.preparedChunks[0].prepared;
    const message = {};
    delivery.attach(message,"Selected complete speech.",record.entries.map(entry=>entry.text));
    f.state.transcript=[message];prepared.entry.transcriptIndex=0;prepared.entry.playbackRate=record.plan.playbackRate;
    return {prepared,message};
}

test("measured speech becomes ready and starts playback while recognition is still pending", async()=>{
    const f=fixture(),{prepared,message}=await ready(f);
    assert.equal(f.calls.decode,1);assert.equal(f.calls.speech,1);assert.equal(f.calls.recognition,1);
    assert.equal(prepared.wordAlignment,undefined);assert.equal(message.text,"");
    assert.equal(f.calls.requests[0].model,catalog.AUDIO_MODELS.speech);
    assert.equal(f.calls.requests[0].voice,"shimmer");assert.match(f.calls.requests[0].instructions,/consistent speaker identity/);
    const reused=await f.c.fetchOpenAiSpeechAudio({...prepared.entry,preparedAudio:prepared},f.state.speechToken);
    assert.equal(reused.audioUrl,prepared.audioUrl);assert.equal(f.calls.speech,1);assert.equal(f.calls.recognition,1);assert.equal(f.calls.decode,1);
    const playback=f.c.playPreparedOpenAiSpeechChunk(prepared,f.state.speechToken);await new Promise(setImmediate);
    assert.equal(f.calls.play,1);assert.equal(contextPolicy.isReady([message]),false);
    f.audio.currentTime=2;f.audio.ended=true;let completed=false;playback.then(()=>{completed=true;});
    f.audio.onended();await new Promise(setImmediate);assert.equal(completed,false);assert.equal(message.text,"");
    f.recognition.resolve({transcriptText:"Actual spoken wording.",alignment:null});await playback;
    assert.equal(message.speechDeliveryState,"complete");assert.equal(message.text,"Actual spoken wording.");
    assert.equal(contextPolicy.isReady([message]),true);assert.equal(f.calls.speech,1);assert.equal(f.calls.recognition,1);
});

test("recognition failure rejects completion and cannot release generated text as delivered context",async()=>{
    const f=fixture(),{prepared,message}=await ready(f);
    const playback=f.c.playPreparedOpenAiSpeechChunk(prepared,f.state.speechToken);await new Promise(setImmediate);
    f.audio.currentTime=2;f.audio.ended=true;f.audio.onended();
    const rejected=assert.rejects(playback,/recognition failed/);f.recognition.reject(Error("recognition failed"));await rejected;
    assert.equal(message.text,"");assert.equal(message.speechDeliveryState,"pending");assert.equal(contextPolicy.isReady([message]),false);
});

test("moderator speech uses real recognition for word highlighting without rewriting its announcement",async()=>{
    const f=fixture(),text="The presentation begins now.",message={kind:"moderator",text,speechDeliveryState:"complete"};
    delivery.attach(message,text,[text],"en",{displayOnly:true});f.state.transcript=[message];
    const prepared=await f.c.fetchOpenAiSpeechAudio({kind:"moderator",voiceKey:"moderator",text,transcriptIndex:0,chunkIndex:0,chunkCount:1,phaseId:f.phase.id},f.state.speechToken);
    assert.equal(f.calls.recognition,1);assert.equal(f.calls.speech,1);
    const playback=f.c.playPreparedOpenAiSpeechChunk(prepared,f.state.speechToken);await new Promise(setImmediate);
    f.recognition.resolve({transcriptText:"The presentation begins now.",alignment:require("../src/shared/word-alignment").alignRecognized(text,[{word:"The",start:0,end:.4},{word:"presentation",start:.4,end:.9},{word:"begins",start:.9,end:1.4},{word:"now",start:1.4,end:1.9}],2)});
    await new Promise(setImmediate);f.audio.currentTime=.5;f.audio.ontimeupdate();
    const range=delivery.previewHighlightRange(message,0,f.audio);
    assert.equal(text.slice(range.startChar,range.endChar),"presentation");assert.equal(message.text,text);assert.equal(message.speechDeliveryState,"complete");
    f.audio.currentTime=2;f.audio.ended=true;f.audio.onended();await playback;
    assert.equal(message.text,text);assert.equal(delivery.previewText(message),null);assert.equal(delivery.isPreviewOnly(message),true);
});

test("late full-audio recognition cannot replace the finalized interrupted prefix",async()=>{
    const f=fixture(),{prepared,message}=await ready(f);
    const playback=f.c.playPreparedOpenAiSpeechChunk(prepared,f.state.speechToken);await new Promise(setImmediate);
    delivery.beginSpokenCutoff(message);delivery.finalizeSpokenCutoff(message,"Actual heard prefix.");
    f.audio.currentTime=2;f.audio.ended=true;f.audio.onended();
    const rejected=assert.rejects(playback);f.recognition.resolve({transcriptText:"Actual heard prefix. UNHEARD TAIL",alignment:null});await rejected;
    assert.equal(message.text,"Actual heard prefix.");assert.equal(message.speechDeliveryState,"cutoff");
});
