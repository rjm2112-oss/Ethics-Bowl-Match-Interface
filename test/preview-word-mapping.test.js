"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {alignRecognized,alignPreviewRecognized,mapPreviewWords}=require("../src/shared/word-alignment");
const delivery=require("../src/shared/speech-delivery");
const {createProviderService}=require("../src/main/provider-service");
const words=text=>text.split(/\s+/).map((word,index)=>({word,start:index,end:index+.8}));
const audio=time=>{const value={currentTime:time};value.played={length:1,start:()=>0,end:()=>value.currentTime};return value;};
const ranges=(preview,recognized,locale="en")=>mapPreviewWords(preview,alignPreviewRecognized(words(recognized),30),locale).map(range=>range?preview.slice(range.startChar,range.endChar):null);

test("preview maps punctuation, contractions, numeric speech and French apostrophes to exact displayed text",()=>{
 assert.deepEqual(ranges("We can’t pay 21 dollars.","We can not pay twenty one dollars"),["We","can’t","can’t","pay","21","21","dollars."]);
 assert.deepEqual(ranges("We can not agree.","We can't agree"),["We","can not","agree."]);
 assert.deepEqual(ranges("Émilie défend l’éthique: 21 idées.","Émilie défend l éthique vingt et un idées","fr"),["Émilie","défend","l’éthique:","l’éthique:","21","21","21","idées."]);
});
test("small recognition differences retain confident surrounding highlights and repeated ambiguous words stay unpainted",()=>{
 assert.deepEqual(ranges("Alex supports rights and duties.","Alex strongly supports freedoms and duties"),["Alex",null,"supports",null,"and","duties."]);
 assert.deepEqual(ranges("Yes yes matters.","yes matters"),[null,"matters."]);
 assert.deepEqual(ranges("therapist helps.","the rapist helps"),[null,null,"helps."]);
});
test("display-only timing recovery drops empty, inverted, zero-duration and non-monotone anchors without inventing times",()=>{
 const raw=[{word:"One",start:0,end:.8},{word:"zero",start:1.2,end:1.2},{word:"two",start:1,end:1.8},{word:"",start:1.8,end:2},{word:"bad",start:2.2,end:2},{word:"back",start:.9,end:1.9},{word:"three",start:2,end:2.8},{word:"late",start:3,end:5},{word:"nan",start:NaN,end:3}];
 assert.throws(()=>alignRecognized("One zero two three",raw,3),/non-monotone/);
 const preview=alignPreviewRecognized(raw,3);
 assert.equal(preview.text,"One two three");
 assert.deepEqual(preview.words.map(word=>[word.startSeconds,word.endSeconds]),[[0,.8],[1,1.8],[2,2.8]]);
 assert.equal(alignPreviewRecognized([{word:"blank",start:0,end:0}],3),null);
 assert.equal(alignPreviewRecognized(raw,NaN),null);
});
test("current spoken preview highlights before completion while delivered text stays heard-only",()=>{
 const message={},text="Actual words only.";delivery.attach(message,text,[text]);
 const raw=words(text),alignment=alignRecognized(text,raw,3);
 const a=audio(.3);assert.equal(delivery.previewHighlightRange(message,0,a),null);
 delivery.registerSpokenTranscript(message,0,{transcriptText:text,alignment,previewAlignment:alignPreviewRecognized(raw,3)});
 assert.deepEqual(delivery.previewHighlightRange(message,0,a),{startChar:0,endChar:6});
 assert.equal(delivery.captureProgress(message,0,a),false);assert.equal(message.text,"");
 a.currentTime=1.3;assert.deepEqual(delivery.previewHighlightRange(message,0,a),{startChar:7,endChar:12});
 delivery.captureProgress(message,0,a);assert.equal(message.text,"Actual");
 assert.doesNotMatch(JSON.stringify(message),/words only/);
 a.currentTime=.9;assert.equal(delivery.previewHighlightRange(message,0,a),null);
 a.currentTime=2.3;a.played={length:2,start:i=>i?2:0,end:i=>i?2.3:.8};assert.equal(delivery.previewHighlightRange(message,0,a),null);
});
test("display-only anchors cannot release partial delivered text and are retired on cutoff or completion",()=>{
 for(const finish of ["cutoff","complete"]){
  const message={},text="One missing two.";delivery.attach(message,text,[text]);
  delivery.registerSpokenTranscript(message,0,{transcriptText:"One actually two.",alignment:null,previewAlignment:alignPreviewRecognized(words("One two"),3)});
  assert.deepEqual(delivery.previewHighlightRange(message,0,audio(1.2)),{startChar:12,endChar:16});
  assert.equal(delivery.captureProgress(message,0,audio(2)),false);assert.equal(message.text,"");
  if(finish==="complete"){delivery.completeChunk(message,0);assert.equal(message.text,"One actually two.");}
  else{delivery.beginSpokenCutoff(message);delivery.finalizeSpokenCutoff(message,"One.");assert.equal(message.text,"One.");}
  assert.equal(delivery.previewHighlightRange(message,0,audio(1.2)),null);assert.equal(delivery.previewText(message),null);
 }
});
test("chunk-local anchors preserve paragraph whitespace and highlight only the active chunk",()=>{
 const message={},text="  First words.\n\nÉmilie  défend l’éthique.  ",chunks=["First words.","Émilie défend l’éthique."];
 delivery.attach(message,text,chunks,"fr");
 delivery.registerSpokenTranscript(message,0,{transcriptText:chunks[0],previewAlignment:alignPreviewRecognized(words(chunks[0]),4)});
 delivery.completeChunk(message,0);
 delivery.registerSpokenTranscript(message,1,{transcriptText:chunks[1],previewAlignment:alignPreviewRecognized(words("Émilie défend l éthique"),4)});
 const range=delivery.previewHighlightRange(message,1,audio(2.2));
 assert.equal(text.slice(range.startChar,range.endChar),"l’éthique.");assert.equal(range.startChar,text.indexOf("l’éthique"));
 assert.equal(delivery.previewHighlightRange(message,0,audio(.2)),null);
});
test("malformed preview maps never paint generated words",()=>{
 for(const change of [{startSeconds:-1},{endSeconds:NaN},{startChar:-1},{endChar:100}]){
  const alignment=alignPreviewRecognized(words("Actual words"),3);Object.assign(alignment.words[0],change);
  assert.deepEqual(mapPreviewWords("Actual words",alignment),[]);
  const message={};delivery.attach(message,"Actual words",["Actual words"]);delivery.registerSpokenTranscript(message,0,{transcriptText:"Actual words",alignment:null,previewAlignment:alignment});
  assert.equal(delivery.previewHighlightRange(message,0,audio(.2)),null);assert.equal(message.text,"");
 }
});
test("provider exposes retained display anchors while strict timing failure and actual transcript remain intact",async()=>{
 let calls=0;const service=createProviderService({credentialStore:{get:async()=>"test-key"},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({text:"One two.",words:[{word:"One",start:0,end:.7},{word:"",start:.7,end:.7},{word:"two",start:.8,end:1.5}]}),{headers:{"content-type":"application/json"}});}});
 const result=await service.alignSpeech({bytes:[1],mimeType:"audio/mpeg",originalText:"One two. Unheard conclusion.",durationSeconds:2});
 assert.equal(calls,1);assert.equal(result.alignment,null);assert.match(result.timingError,/invalid/);
 assert.equal(result.transcriptText,"One two.");assert.equal(result.previewAlignment.text,"One two");
 assert.doesNotMatch(JSON.stringify(result),/Unheard/);
});
