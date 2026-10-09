'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const delivery=require('../src/shared/speech-delivery'),{alignRecognized}=require('../src/shared/word-alignment'),harness=require('./helpers/renderer-harness');
const played=t=>({length:1,start:()=>0,end:()=>t});
const audio=t=>({currentTime:t,played:played(t),paused:false,playbackRate:1});
function fixture(text='Actual words only.',chunks=['Private generated source.']) {
 const m={kind:'ai',label:'Luna',time:'2026-10-09T04:00:00Z'};delivery.attach(m,chunks.join(' '),chunks);
 const words=Array.from(text.matchAll(/\S+/g)).map((x,i)=>({word:x[0],start:i*.5,end:(i+1)*.5}));
 delivery.registerSpokenTranscript(m,0,{transcriptText:text,alignment:alignRecognized(text,words,words.length*.5+.1)});return m;
}
function node(tag='div') {
 return {tag,children:[],dataset:{},className:'',_text:'',set textContent(v){this._text=String(v);this.children=[];},get textContent(){return this._text+this.children.map(n=>n.textContent).join('');},appendChild(n){this.children.push(n);return n;},querySelector(selector){const cls=selector.slice(1);for(const n of this.children){if(n.className===cls)return n;const found=n.querySelector?.(selector);if(found)return found;}return null;}};
}
function renderer(m,a) {
 let c,body;
 const render=()=>{body=c.createMessageElement(m,0).querySelector('.bubble-body');};
 c=harness.load(['captureActiveSpeechDelivery','createMessageElement','resetSpeechProgressState','stopSpeechPlayback'],{
  state:{transcript:[m],matchRunId:8,speechToken:4,currentDeliveryPlayback:{message:m,entry:{transcriptIndex:0,chunkIndex:0},audio:a,token:4,runId:8},speechAudioEl:{pause(){},load(){},removeAttribute(){}}},
  document:{body:{contains:()=>true},createElement:node,createTextNode:text=>({textContent:text})},window:{requestAnimationFrame:()=>0},
  getMessageBodyEl:()=>body,renderTranscript:render,syncSpeechProgressToUi:render,
  refreshSpeechUi(){},updateComposerModeIndicator(){},clearTimingTestAudioCache(){},setStatus(){},
  restoreMessageBodyPlainText(){if(body)body.textContent=m.text;}
 });render();return {c,body:()=>body,render};
}
test('recognized words highlight only after actual played endpoints, independently of rate and pause',()=>{
 const m=fixture(),a=audio(.49);assert.equal(delivery.captureProgress(m,0,a),false);assert.equal(delivery.highlightRange(m,0,a),null);
 a.currentTime=.5;a.played=played(.5);delivery.captureProgress(m,0,a);assert.equal(m.text,'Actual');assert.deepEqual(delivery.highlightRange(m,0,a),{startChar:0,endChar:6});
 a.paused=true;a.playbackRate=1.09;delivery.captureProgress(m,0,a);assert.equal(m.text,'Actual');assert.equal(m.text.slice(delivery.highlightRange(m,0,a).startChar),'Actual');
 a.paused=false;a.currentTime=1;a.played=played(1);a.playbackRate=.924;delivery.captureProgress(m,0,a);assert.equal(m.text,'Actual words');assert.deepEqual(delivery.highlightRange(m,0,a),{startChar:7,endChar:12});assert.doesNotMatch(m.text,/Private|only/);
});
test('seeking ahead across an unplayed gap cannot highlight or display future speech',()=>{
 const m=fixture(),a={currentTime:2,played:{length:2,start:i=>i?1.5:0,end:i=>i?2:.5}};delivery.captureProgress(m,0,a);assert.equal(m.text,'Actual');assert.deepEqual(delivery.highlightRange(m,0,a),{startChar:0,endChar:6});
});

test('moderator preview paints only the current spoken word with the complete announcement visible',()=>{
 const text='Your presentation begins now.',m={kind:'moderator',label:'Moderator',text,speechDeliveryState:'complete'};
 delivery.attach(m,text,[text],'en',{displayOnly:true});
 delivery.registerSpokenTranscript(m,0,{transcriptText:text,alignment:alignRecognized(text,[{word:'Your',start:0,end:.5},{word:'presentation',start:.5,end:1},{word:'begins',start:1,end:1.5},{word:'now',start:1.5,end:2}],2)});
 const a=audio(.75),r=renderer(m,a);r.c.captureActiveSpeechDelivery();
 assert.equal(r.body().textContent,text);assert.equal(r.body().querySelector('.speech-speaking').textContent,'presentation');assert.equal(m.text,text);
 a.currentTime=1.25;a.played=played(1.25);r.c.captureActiveSpeechDelivery();
 assert.equal(r.body().querySelector('.speech-speaking').textContent,'begins');assert.equal(m.text,text);
 delivery.endPreview(m);r.render();assert.equal(r.body().querySelector('.speech-speaking'),null);assert.equal(m.text,text);
});
test('chunk boundaries map repeated recognized text to the current chunk, never source offsets',()=>{
 const m=fixture('Actual words.',['Private one.','Private two.']),a=audio(1);delivery.captureProgress(m,0,a);delivery.completeChunk(m,0);assert.equal(delivery.highlightRange(m,0,a),null);
 delivery.registerSpokenTranscript(m,1,{transcriptText:'Actual words.',alignment:alignRecognized('Actual words.',[{word:'Actual',start:0,end:.5},{word:'words',start:.5,end:1}],1.1)});
 a.currentTime=.5;a.played=played(.5);delivery.captureProgress(m,1,a);assert.equal(m.text,'Actual words. Actual');assert.deepEqual(delivery.highlightRange(m,1,a),{startChar:14,endChar:20});assert.equal(delivery.highlightRange(m,0,a),null);
 delivery.completeChunk(m,1);assert.equal(delivery.highlightRange(m,1,a),null);
});
test('uncertain zero-duration words wait for real anchors and trailing uncertainty waits for full playback',()=>{
 const m={};delivery.attach(m,'Private.',['Private.']);delivery.registerSpokenTranscript(m,0,{transcriptText:'One two three.',alignment:alignRecognized('One two three.',[{word:'One',start:0,end:0},{word:'two',start:0,end:.8},{word:'three',start:.8,end:.8}],1)});
 delivery.captureProgress(m,0,audio(.7));assert.equal(m.text,'');delivery.captureProgress(m,0,audio(.8));assert.equal(m.text,'One two');assert.deepEqual(delivery.highlightRange(m,0,audio(1)),{startChar:4,endChar:7});delivery.completeChunk(m,0);assert.equal(m.text,'One two three.');assert.equal(delivery.highlightRange(m,0,audio(1)),null);
});
test('missing, malformed, mismatched, or non-monotone maps never invent early text or highlights',()=>{
 const maps=[null,{text:'Actual.',words:[{startChar:0,endChar:7,startSeconds:0,endSeconds:NaN}]},{text:'Actual.',words:[{startChar:-1,endChar:7,startSeconds:0,endSeconds:.5}]},{text:'Actual.',words:[{startChar:0,endChar:70,startSeconds:0,endSeconds:.5}]},{text:'Actual.',words:[{startChar:0,endChar:7,startSeconds:-1,endSeconds:.5}]}];
 for(const alignment of maps){const m={};delivery.attach(m,'Private.',['Private.']);delivery.registerSpokenTranscript(m,0,{transcriptText:'Actual.',alignment});assert.equal(delivery.captureProgress(m,0,audio(2)),false);assert.equal(delivery.highlightRange(m,0,audio(2)),null);assert.equal(m.text,'');}
 const m=fixture();m.text='Private generated source.';assert.equal(delivery.highlightRange(m,0,audio(1)),null);
});
test('renderer shows a stable generated preview while the separate ledger follows actual speech',()=>{
 const m=fixture(),a=audio(1),r=renderer(m,a);r.c.captureActiveSpeechDelivery();assert.equal(r.body().textContent,'Private generated source.');assert.equal(m.text,'Actual words');assert.equal(r.body().querySelector('.speech-speaking'),null);
 delivery.beginSpokenCutoff(m);r.c.captureActiveSpeechDelivery();r.render();assert.equal(r.body().querySelector('.speech-speaking'),null);assert.doesNotMatch(r.body().textContent,/only|Private/);
 delivery.finalizeSpokenCutoff(m,'Actually cut off.');r.render();assert.equal(r.body().textContent,'Actually cut off.');assert.equal(r.body().querySelector('.speech-speaking'),null);
 const full=fixture(),f=renderer(full,audio(1.5));f.c.captureActiveSpeechDelivery();delivery.completeChunk(full,0);f.render();assert.equal(f.body().querySelector('.speech-speaking'),null);assert.equal(f.body().textContent,'Actual words only.');
});
test('reset and close remove highlights without new recognition; stale callbacks cannot restore them',async()=>{
 for(const reason of ['reset','closed']){const m=fixture(),r=renderer(m,audio(1));r.c.captureActiveSpeechDelivery();assert.equal(r.body().textContent,'Private generated source.');await r.c.stopSpeechPlayback(false,{resolveCallbacks:false,deliveryReason:reason});r.render();assert.equal(r.body().querySelector('.speech-speaking'),null);assert.doesNotMatch(r.body().textContent,/Private/);assert.equal(m.speechDeliveryState,'unresolved');assert.equal(r.c.state.speechProgressMessageIndex,-1);r.c.captureActiveSpeechDelivery();assert.equal(r.body().querySelector('.speech-speaking'),null);}
 const m=fixture(),r=renderer(m,audio(1));r.c.state.matchRunId++;r.c.captureActiveSpeechDelivery();assert.equal(m.text,'');r.render();assert.equal(r.body().querySelector('.speech-speaking'),null);
});
test('anonymized recorded timing fixture releases and highlights only its confirmed public prefix',()=>{
 const saved=require('./fixtures/highlight-recorded-question.json'),m={};delivery.attach(m,saved.originalGeneratedText,[saved.originalGeneratedText]);delivery.registerSpokenTranscript(m,0,saved);
 for(const boundary of [.1,.8,2,4,8,15,22,saved.audioDurationSeconds]){const a=audio(boundary);delivery.captureProgress(m,0,a);const range=delivery.highlightRange(m,0,a);if(range){assert.ok(range.startChar>=0 && range.endChar<=m.text.length);assert.equal(m.text.slice(range.startChar,range.endChar),saved.transcriptText.slice(range.startChar,range.endChar));assert.ok(saved.alignment.words.find(w=>w.startChar===range.startChar).endSeconds<=boundary);}assert.ok(saved.transcriptText.startsWith(m.text));}
});

test('switching speakers keeps generated previews separate from each speaker’s recognized text',()=>{
 const first=fixture('First speaker words.'),r=renderer(first,audio(1));r.c.captureActiveSpeechDelivery();assert.equal(first.text,'First speaker');assert.equal(r.body().textContent,'Private generated source.');
 const second=fixture('Second speaker words.');r.c.state.transcript.push(second);r.c.state.currentDeliveryPlayback={message:second,entry:{transcriptIndex:1,chunkIndex:0},audio:audio(1),token:r.c.state.speechToken,runId:r.c.state.matchRunId};r.c.captureActiveSpeechDelivery();
 assert.equal(r.body().querySelector('.speech-speaking'),null);const row=r.c.createMessageElement(second,1);assert.equal(row.querySelector('.speech-speaking'),null);assert.equal(row.querySelector('.bubble-body').textContent,'Private generated source.');assert.equal(second.text,'Second speaker');
});

test('media crossing a word boundary before paint retains only the last displayed confirmed word',()=>{
 const m=fixture(),a=audio(.5);delivery.captureProgress(m,0,a);a.currentTime=1.01;a.played=played(1.01);assert.equal(m.text,'Actual');assert.deepEqual(delivery.highlightRange(m,0,a),{startChar:0,endChar:6});delivery.captureProgress(m,0,a);assert.deepEqual(delivery.highlightRange(m,0,a),{startChar:7,endChar:12});
});
