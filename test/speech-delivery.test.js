"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const delivery=require("../src/shared/speech-delivery"),contexts=require("../src/shared/transcript-context"),pcm=require("../src/shared/audio-pcm"),{alignRecognized}=require("../src/shared/word-alignment");
const ranges=through=>({length:1,start:()=>0,end:()=>through});
test("only recognized completed chunks enter transcript; generated tail stays private",()=>{
 const message={};delivery.attach(message,"Generated first. PRIVATE_TAIL",["Generated first.","PRIVATE_TAIL"]);
 assert.equal(message.text,"");assert.doesNotMatch(JSON.stringify(message),/PRIVATE/);assert.equal(delivery.completeChunk(message,1),false);
 delivery.registerSpokenTranscript(message,0,{transcriptText:"Actual first."});delivery.registerSpokenTranscript(message,1,{transcriptText:"Actual ending."});
 assert.equal(delivery.completeChunk(message,0),true);assert.equal(message.text,"Actual first.");assert.equal(message.speechDeliveryState,"pending");
 assert.equal(delivery.completeChunk(message,1),true);assert.equal(message.text,"Actual first. Actual ending.");assert.equal(message.speechDeliveryState,"complete");assert.equal(delivery.completeChunk(message,1),false);
});
test("cutoff finalizes only completed chunks plus actual cropped-audio recognition and blocks late events",()=>{
 const message={};delivery.attach(message,"First. PRIVATE_TAIL",["First.","PRIVATE_TAIL"]);delivery.registerSpokenTranscript(message,0,{transcriptText:"Recognized first."});delivery.completeChunk(message,0);
 assert.equal(delivery.beginSpokenCutoff(message),true);assert.equal(message.text,"Recognized first.");assert.equal(contexts.isReady([message]),false);
 delivery.sealUnresolved(message);assert.equal(message.speechDeliveryState,"unresolved");assert.equal(delivery.completeChunk(message,1),false);
 assert.equal(delivery.finalizeSpokenCutoff(message,"Played partial."),true);assert.equal(message.text,"Recognized first. Played partial.");assert.equal(message.speechDeliveryState,"cutoff");assert.equal(contexts.isReady([message]),true);assert.equal(delivery.finalizeSpokenCutoff(message,"LATE_TAIL"),false);assert.doesNotMatch(JSON.stringify(message),/PRIVATE|LATE/);
});
test("missing timestamps cannot reveal text early; full actual speech remains available",()=>{
 const m={};delivery.attach(m,"PRIVATE_GENERATED",["PRIVATE_GENERATED"]);delivery.registerSpokenTranscript(m,0,{transcriptText:"Actually spoken.",alignment:null});
 assert.equal(delivery.captureProgress(m,0,{currentTime:2,played:ranges(2)}),false);assert.equal(m.text,"");assert.equal(delivery.completeChunk(m,0),true);assert.equal(m.text,"Actually spoken.");
 const cutoff={};delivery.attach(cutoff,"PRIVATE_GENERATED",["PRIVATE_GENERATED"]);delivery.beginSpokenCutoff(cutoff);delivery.finalizeSpokenCutoff(cutoff,"");assert.equal(cutoff.text,"");
});
test("highlighting advances only through contiguous played media and returned word ends",()=>{
 const m={},text="Alex, protect rights.";delivery.attach(m,"Different generated words.",["Different generated words."]);delivery.registerSpokenTranscript(m,0,{transcriptText:text,alignment:alignRecognized(text,[{word:"Alex",start:0,end:.8},{word:"protect",start:1,end:1.8},{word:"rights",start:2,end:2.8}],3)});
 delivery.captureProgress(m,0,{currentTime:1.8,playbackRate:1.09,played:ranges(.8)});assert.equal(m.text,"Alex,");delivery.captureProgress(m,0,{currentTime:1.8,playbackRate:.924,played:ranges(1.8)});assert.equal(m.text,"Alex, protect");
 assert.equal(delivery.playedThrough({played:{length:2,start:i=>i?2:0,end:i=>i?3:1}}),1);
 assert.equal(delivery.hasFullPlayback({ended:true,duration:3,played:ranges(3)}),true);assert.equal(delivery.hasFullPlayback({ended:true,duration:3,played:ranges(2)}),false);
});
test("model context rejects every unfinished or absent delivery state without generated-text fallback",()=>{
 for(const state of [undefined,"pending","transcribing","unresolved","simulated"]){const messages=[{kind:"ai",text:"PRIVATE_TAIL",speechDeliveryState:state}];assert.throws(()=>contexts.discussion({messages,phases:[]}),/verified delivered transcript/);}
 assert.equal(contexts.discussion({messages:[{kind:"ai",label:"Alex",text:"Played only.",speechDeliveryState:"cutoff"}],phases:[]}),"[Turn • Alex • Stopped at time limit] Played only.");
});
test("speech chunk mismatch or recognized timestamp mismatch fails explicitly",()=>{
 assert.throws(()=>delivery.attach({},"All original words.",["All original"]),/exactly cover/);
 const m={};delivery.attach(m,"Private.",["Private."]);assert.throws(()=>delivery.registerSpokenTranscript(m,0,{transcriptText:"Actual.",alignment:{text:"Other.",words:[]}}),/recognized speech/);assert.throws(()=>delivery.completeChunk(m,0),/speech transcript/);
});
test("cutoff PCM has precisely the played frames, downmixes channels and ignores playback speed",()=>{
 const left=Float32Array.from([.1,.2,.3,.4,.5,.6,.7,.8]),right=Float32Array.from([-.1,0,.1,.2,.3,.4,.5,.6]);const decoded={length:8,sampleRate:4,numberOfChannels:2,getChannelData:i=>i?right:left};
 const crop=pcm.encodePlayedPrefix(decoded,.75),view=new DataView(crop.bytes.buffer);assert.equal(crop.durationSeconds,.75);assert.equal(crop.bytes.length,50);assert.equal(view.getUint32(40,true),6);assert.equal(view.getUint16(22,true),1);assert.equal(view.getInt16(44,true),0);assert.equal(view.getInt16(48,true),Math.trunc(.2*32767));assert.throws(()=>pcm.encodePlayedPrefix(decoded,0),/frames/);assert.throws(()=>pcm.encodePlayedPrefix(decoded,NaN),/Invalid/);
});
