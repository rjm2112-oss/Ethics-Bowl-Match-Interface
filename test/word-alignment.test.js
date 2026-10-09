"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {alignRecognized}=require("../src/shared/word-alignment");
const delivery=require("../src/shared/speech-delivery");
const {createProviderService}=require("../src/main/provider-service");
const {validateAlignmentRequest}=require("../src/main/validation");
function words(text){return text.split(/\s+/).map((word,i)=>({word,start:i,end:i+.8}));}
test("English names, hyphens, contractions, punctuation and known numeric forms map to original offsets",()=>{
 const original="Jean-Luc O’Neill can't pay 21 dollars. 3.5 matters.";
 const alignment=alignRecognized(original,words("Jean Luc O'Neill can not pay twenty one dollars three point five matters"),20,"en");
 assert.equal(alignment.text,original);assert.equal(alignment.words.length,8);
 for(const word of alignment.words)assert.ok(original.slice(word.startChar,word.endChar));
 assert.equal(original.slice(alignment.words[0].startChar,alignment.words[0].endChar),"Jean-Luc");
 assert.equal(original.slice(alignment.words[4].startChar,alignment.words[4].endChar),"21");
 assert.equal(original.slice(alignment.words[6].startChar,alignment.words[6].endChar),"3.5");
});
test("French apostrophes, accents and number forms preserve exact original spelling",()=>{
 const original="Émilie défend l’éthique: 21 personnes, 71 idées, 3,5 points.";
 const aligned=alignRecognized(original,words("Émilie défend l éthique vingt et un personnes soixante et onze idées trois virgule cinq points"),25,"fr");
 assert.equal(aligned.text,original);assert.equal(aligned.words.length,9);
 assert.equal(original.slice(aligned.words[2].startChar,aligned.words[2].endChar),"l’éthique:");
});
test("missing, extra, substituted, ambiguously merged words and decimal errors block alignment",()=>{
 for(const [original,recognized] of [["Alex supports rights","Alex rights"],["Alex supports rights","Alex strongly supports rights"],["Alex supports rights","Alec supports rights"],["therapist","the rapist"],["3.5","35"],["Émilie","Emilie"]])assert.throws(()=>alignRecognized(original,words(recognized),20,"en"),/match/);
 for(const invalid of [[{word:"Alex",start:1,end:.5}],[{word:"Alex",start:0,end:21}],[]])assert.throws(()=>alignRecognized("Alex",invalid,20));
 assert.throws(()=>alignRecognized("Alex Morgan",[{word:"Alex",start:1,end:2},{word:"Morgan",start:0,end:1}],20),/non-monotone/);
});
test("observed humanlike/human-like spelling split maps exactly without general arbitrary word merging",()=>{
 const f=require('./fixtures/whisper-humanlike-spelling.json');const result=alignRecognized(f.originalText,f.recognition.words,f.durationSeconds,'en');assert.equal(result.text,f.originalText);assert.equal(f.originalText.slice(result.words[2].startChar,result.words[2].endChar),'humanlike');
 assert.throws(()=>alignRecognized('therapist',words('the rapist'),5),/match/);assert.throws(()=>alignRecognized('helps someone',words('help someone'),5),/match/);
});


test("anonymized recorded zero-duration timestamp fixture waits for returned following anchors and never reveals a trailing uncertain word early",()=>{
 const f=require("./fixtures/whisper-zero-duration.json"),text=f.recognition.text||f.source.originalText,alignment=alignRecognized(text,f.recognition.words,f.source.durationSeconds);
 assert.ok(alignment.conservativeGroups.length);
 for(const group of alignment.conservativeGroups){const m={};delivery.attach(m,text,[text]);delivery.registerSpokenTranscript(m,0,{transcriptText:text,alignment});const before=group.endSeconds-.000001;delivery.captureProgress(m,0,{currentTime:before,played:{length:1,start:()=>0,end:()=>before}});assert.ok(m.text.length<=alignment.words[group.firstWordIndex].startChar);delivery.captureProgress(m,0,{currentTime:group.endSeconds,played:{length:1,start:()=>0,end:()=>group.endSeconds}});assert.ok(m.text.length>=alignment.words[group.lastWordIndex].endChar);}
 const tail=alignRecognized("Alex Morgan",[{word:"Alex",start:0,end:1},{word:"Morgan",start:1,end:1}],2);const m={};delivery.attach(m,"Alex Morgan",["Alex Morgan"]);delivery.registerSpokenTranscript(m,0,{transcriptText:"Alex Morgan",alignment:tail});delivery.captureProgress(m,0,{currentTime:2,played:{length:1,start:()=>0,end:()=>2}});assert.equal(m.text,"Alex");delivery.completeChunk(m,0);assert.equal(m.text,"Alex Morgan");
});
test("one unprompted recognition accepts actual speech differing from generated text and caches by audio identity",async()=>{
 let calls=0;const service=createProviderService({credentialStore:{get:async()=>"test-key"},fetchImpl:async(_url,options)=>{calls++;assert.equal(options.body.get("prompt"),null);return new Response(JSON.stringify({text:"Machine minds.",words:[{word:"Machine",start:0,end:1},{word:"minds",start:1,end:2}],duration:2.3}),{headers:{"content-type":"application/json"}});}});
 const payload={bytes:[1,2,3],mimeType:"audio/mpeg",originalText:"Machine minds. PRIVATE_TAIL",durationSeconds:2.3,language:"en"};const result=await service.alignSpeech(payload);assert.equal(result.transcriptText,"Machine minds.");assert.equal(result.alignment.text,result.transcriptText);assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);await service.alignSpeech({...payload,originalText:"Other generated answer"});assert.equal(calls,1);
 assert.throws(()=>validateAlignmentRequest({...payload,transcriptPolicy:"original-source"}),/canonical/);
});
test("full ASR text remains valid when word timing cannot map; cutoff must use actual cropped audio",async()=>{
 const service=createProviderService({credentialStore:{get:async()=>"test-key"},fetchImpl:async()=>new Response(JSON.stringify({text:"Actual complete speech.",words:[{word:"Actual",start:0,end:1}]}),{headers:{"content-type":"application/json"}})});
 const result=await service.alignSpeech({bytes:[1],mimeType:"audio/mpeg",originalText:"Generated speech.",durationSeconds:2});assert.equal(result.transcriptText,"Actual complete speech.");assert.equal(result.alignment,null);assert.match(result.timingError,/match/);
});
