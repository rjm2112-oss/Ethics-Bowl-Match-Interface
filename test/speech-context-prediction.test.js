"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const delivery = require("../src/shared/speech-delivery");
const {alignRecognized} = require("../src/shared/word-alignment");
const {planWholeSpeechPlayback} = require("../src/shared/speech-timing");

function chunk(text, durationSeconds, words) {
    const tokens=text.split(" ");
    return {durationSeconds,transcript:{transcriptText:text,alignment:alignRecognized(text,
        words || tokens.map((word,index)=>({word,start:index*durationSeconds/tokens.length,end:(index+1)*durationSeconds/tokens.length})),durationSeconds)}};
}
const plan = seconds => ({timerBudgetSeconds:seconds,timerLeadSeconds:0,playbackReserveSeconds:0,playbackRate:1});

test("prediction uses recognized audio without publishing generated or delivered text",()=>{
    const message={};delivery.attach(message,"PRIVATE DRAFT TAIL",["PRIVATE DRAFT TAIL"]);
    const prediction=delivery.predictTimedTranscript([chunk("Actual audio words.",3)],plan(10));
    assert.deepEqual(prediction,{text:"Actual audio words.",deliveryState:"complete"});
    assert.equal(message.text,"");assert.equal(message.speechDeliveryState,"pending");
    assert.doesNotMatch(JSON.stringify(prediction),/PRIVATE|DRAFT/);
});

test("cutoff prediction allows at most two following recognized words across chunk boundaries",()=>{
    const chunks=[chunk("First heard sentence.",3),chunk("Second heard sentence.",6)];
    for (const [seconds,text] of [[1,"First heard sentence."],[2,"First heard sentence. Second"],[3,"First heard sentence. Second heard"],[4.9,"First heard sentence. Second heard"],[5,"First heard sentence. Second heard sentence."],[7,"First heard sentence. Second heard sentence."]]) {
        assert.deepEqual(delivery.predictTimedTranscript(chunks,plan(seconds)),{text,deliveryState:"cutoff"});
    }
    assert.equal(delivery.predictTimedTranscript(chunks,plan(.99)),null);
    assert.deepEqual(delivery.predictTimedTranscript(chunks,plan(9)),{text:"First heard sentence. Second heard sentence.",deliveryState:"complete"});
});

test("uncertain timestamp groups cannot expand the two-word overestimate allowance",()=>{
    const words=[{word:"We",start:0,end:.5},{word:"do",start:.5,end:.5},{word:"not",start:.5,end:.5},{word:"agree",start:.5,end:2},{word:"yet",start:2,end:2}];
    const chunks=[chunk("We do not agree yet",3,words)];
    assert.equal(delivery.predictTimedTranscript(chunks,plan(1.99)).text,"We do not");
    assert.equal(delivery.predictTimedTranscript(chunks,plan(2.5)).text,"We do not agree yet");
    assert.equal(delivery.predictTimedTranscript(chunks,plan(3)).text,"We do not agree yet");
});

test("full recognized audio needs no word timestamps, but partial audio does",()=>{
    const chunks=[{durationSeconds:8,transcript:{transcriptText:"Complete recognized contribution.",alignment:null}}];
    assert.deepEqual(delivery.predictTimedTranscript(chunks,plan(9)),{text:"Complete recognized contribution.",deliveryState:"complete"});
    assert.equal(delivery.predictTimedTranscript(chunks,plan(4)),null);
});

test("recognition whitespace and paragraph boundaries preserve the exact prefix offsets",()=>{
    const first="First  heard\nsentence.",second="Second\tparagraph has  more words.";
    const aligned=text=>({durationSeconds:6,transcript:{transcriptText:text,alignment:alignRecognized(text,
        Array.from(text.matchAll(/\S+/gu),(token,index)=>({word:token[0],start:index,end:index+1})),6)}});
    const chunks=[aligned(first),aligned(second)];
    assert.equal(delivery.predictTimedTranscript(chunks,plan(2)).text,"First  heard\nsentence. Second");
    assert.equal(delivery.predictTimedTranscript(chunks,plan(7)).text,"First  heard\nsentence. Second\tparagraph has");
    assert.equal(delivery.predictTimedTranscript(chunks,plan(12)).text,first+" "+second);
});

test("invalid, incomplete or inconsistent audio measurements fail closed",()=>{
    const valid=chunk("Some recognized words.",3);
    for(const bad of [[],[null],[{...valid,durationSeconds:0}],[{...valid,durationSeconds:Infinity}],[{...valid,transcript:null}],[{...valid,transcript:{transcriptText:""}}]]) {
        assert.equal(delivery.predictTimedTranscript(bad,plan(10)),null);
    }
    for(const bad of [null,{},plan(-1),{...plan(10),playbackRate:0},{...plan(10),timerLeadSeconds:NaN},{...plan(10),playbackReserveSeconds:-1}])assert.equal(delivery.predictTimedTranscript([valid],bad),null);
    for(const words of [[{startChar:0,endChar:4,startSeconds:0,endSeconds:NaN}],[{startChar:0,endChar:4,startSeconds:2,endSeconds:1}]]) {
        const malformed={...valid,transcript:{transcriptText:valid.transcript.transcriptText,alignment:{text:valid.transcript.transcriptText,words}}};
        assert.equal(delivery.predictTimedTranscript([malformed],plan(2)),null);
    }
});

test("measured full and overlong speech predictions match an independent timing oracle across 576 cases",()=>{
    let checks=0;
    for(const locale of ["en","fr-ca"])for(const budget of [140,180,300])for(const ratio of [.25,.75,.95,1,1.1,1.5])for(const count of [1,2,3,4])for(const reserve of [0,1,3,5]) {
        const natural=budget*ratio,perChunk=natural/count;
        const chunks=Array.from({length:count},(_,index)=>chunk(Array.from({length:12},(_,word)=>`${locale==="en"?"word":"mot"}${index*12+word}`).join(" "),perChunk));
        const timing=planWholeSpeechPlayback({audioDurationSeconds:natural,timerBudgetSeconds:budget,timerLeadMs:350,playbackReserveSeconds:reserve});
        const limit=(budget-.35-reserve)*timing.playbackRate;
        const allWords=chunks.flatMap(c=>c.transcript.transcriptText.split(" "));
        const heard=chunks.flatMap((c,index)=>c.transcript.alignment.words.filter(word=>index*perChunk+word.endSeconds<=limit+1e-7));
        const expected=allWords.slice(0,heard.length+(natural>limit+1e-7?2:0)).join(" ");
        const actual=delivery.predictTimedTranscript(chunks,timing);
        assert.equal(actual?.text||"",expected);
        assert.equal(actual?.deliveryState,natural<=limit+1e-7?"complete":"cutoff");
        checks++;
    }
    assert.equal(checks,576);
});
