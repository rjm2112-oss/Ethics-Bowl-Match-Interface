"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const harness=require("./helpers/renderer-harness"),delivery=require("../src/shared/speech-delivery"),contexts=require("../src/shared/transcript-context"),prompts=require("../src/shared/ai-turn-prompt"),tally=require("../src/shared/scorecard-tally");
function element(tag){return {tag,className:"",textContent:"",children:[],innerHTML:"",appendChild(child){this.children.push(child);}};}
function descendants(el){return [el,...el.children.flatMap(descendants)];}
const full={presentationQuestion:5,presentationEthics:5,presentationViewpoints:5,responseToFeedback:10,judgesQuestions:20,commentary:10,respectfulDialogue:5};
for(const sourceMode of ["ai","human"])test(`${sourceMode} historical dialogue score cards retain their original comment, numeric totals and votes`,()=>{
 const cards=[1,2,3].map(n=>({judgeNumber:n,name:"Judge "+n,humanScore:60,aiScore:60,comment:"Overall comment "+n,humanComment:"LEGACY_ONE",aiComment:"LEGACY_TWO",...(sourceMode==="ai"?{humanBreakdown:full,aiBreakdown:full}:{})}));const host=element("div"),summary=element("div"),dialogue=[];
 const c=harness.load(["renderScorecards","renderJudgeScorecardBody"],{document:{createElement:element},scoreCardsEl:host,scoreSummaryEl:summary,speakerName:role=>role==="human"?"Alex":"Morgan",l:en=>en,appendMessage:(kind,label,text,options)=>dialogue.push({kind,label,text,...options})});
 c.renderScorecards(cards,tally.computeVoteTally(cards),sourceMode);assert.equal(host.children.length,0);assert.equal(dialogue.length,3);
 for(const message of dialogue){assert.equal(message.silent,true);assert.equal(message.substantive,false);const body=element("div");c.renderJudgeScorecardBody(body,message.scorecard);const nodes=descendants(body),text=nodes.map(n=>n.textContent).join("\n");assert.equal(nodes.filter(n=>n.className==="judge-result-comment").length,1);assert.match(text,/60\/60/);assert.doesNotMatch(text,/LEGACY|Evidence:|Limitation:|Next threshold/);if(sourceMode==="ai")assert.equal(nodes.filter(n=>n.tag==="td").length,16);}
 assert.match(summary.textContent,/1.5 votes.*1.5 votes.*tie/);
});
test("renderer publishes an empty pending transcript while TTS receives the original private source",()=>{
 const state={transcript:[]},queued=[];const c=harness.load(["appendMessage"],{state,getVoiceKeyForMessage:()=>"ai",shouldAutoSpeakMessage:()=>true,chunkTextForSpeech:()=>["Generated first.","PRIVATE_TAIL"],enqueueTranscriptSpeech:(...args)=>queued.push(args),emptyStateEl:{},chatEl:{innerHTML:"",appendChild(){}},document:{createElement:()=>({className:"",dataset:{},appendChild(){}}),createTextNode:text=>({textContent:text})},formatBubbleTime:()=>"",getMessageBodyEl:()=>null});
 c.appendMessage("ai","Morgan","Generated first. PRIVATE_TAIL",{phaseId:"answer"});assert.equal(state.transcript[0].text,"");assert.equal(state.transcript[0].speechDeliveryState,"pending");assert.doesNotMatch(JSON.stringify(state.transcript),/PRIVATE_TAIL/);assert.equal(queued[0][1],"Generated first. PRIVATE_TAIL");
 delivery.registerSpokenTranscript(state.transcript[0],0,{transcriptText:"Actually heard."});delivery.completeChunk(state.transcript[0],0);delivery.sealUnresolved(state.transcript[0]);assert.equal(state.transcript[0].text,"Actually heard.");
});
function questionFixture(){
 const phase={id:"case1-judge1-question",kind:"judgeQuestion",caseNum:1,judgeNumber:1},answer={id:"case1-judge1-answer",kind:"judgeAnswer",caseNum:1,judgeNumber:1,speaker:"ai"};
 const state={...require("../src/shared/match-session").create({modelCatalog:require("../src/shared/model-catalog")}),transcript:[],phases:[phase,answer],currentPhaseIndex:0,phaseAwaitingPlaybackForId:phase.id,judgeQuestionCache:{1:["Generated PRIVATE_TAIL"]}},observed={};
 const ctx={state,settings:{TIMED_SPEECH_TIMER_LEAD_MS:350},platform:{console},services:{getCurrentPhase:()=>phase,usesAiJudgeQuestions:()=>true,setBusy(){},setStatus(){},isFrenchLocale:()=>false,judgeLabel:n=>"Judge "+n,l:en=>en,sanitizeText:text=>String(text).trim(),setPhaseAwaitingPlayback(){},startTimerWithAutoSpeech(){},clearPhaseAwaitingPlayback(){},clearWholeSpeechPreparation(){},isAiControlledRole:()=>true,maybePrepareAiTurnForPhase:async p=>{observed.answerQuestion=state.askedJudgeQuestions[p.id];return "";},prepareWholeSpeechAudioForPhase:async()=>{},advancePhase:()=>{observed.advanced=true;},blockAutoGenerationForPhase:()=>{observed.blocked=true;},appendMessage:(kind,label,text,options)=>{observed.options=options;const message={};delivery.attach(message,text,[text]);state.transcript.push(message);return 0;}}};
 Object.assign(ctx.services,require("../src/renderer/questions").create(ctx));return {state,phase,observed,ctx};
}
test("judge answers use the complete generated question before playback while the transcript records recognized speech",async()=>{
 const {state,phase,observed,ctx}=questionFixture();await ctx.services.askAiJudgeQuestion(phase);assert.equal(observed.answerQuestion,"Generated PRIVATE_TAIL");assert.equal(state.transcript[0].text,"");
 delivery.registerSpokenTranscript(state.transcript[0],0,{transcriptText:"Actual recognized question?"});delivery.completeChunk(state.transcript[0],0);observed.options.onPlaybackComplete();
 assert.equal(state.askedJudgeQuestions[phase.id],"Generated PRIVATE_TAIL");assert.equal(observed.answerQuestion,"Generated PRIVATE_TAIL");assert.equal(observed.advanced,true);assert.equal(state.transcript[0].text,"Actual recognized question?");assert.doesNotMatch(JSON.stringify(state.transcript),/PRIVATE/);
});
test("an unresolved judge interruption still blocks phase advance after answer preparation has begun",async()=>{
 const {state,phase,observed,ctx}=questionFixture();await ctx.services.askAiJudgeQuestion(phase);delivery.sealUnresolved(state.transcript[0]);observed.options.onPlaybackComplete();assert.equal(observed.blocked,true);assert.equal(observed.answerQuestion,"Generated PRIVATE_TAIL");assert.equal(observed.advanced,undefined);assert.equal(state.transcript[0].speechDeliveryState,"unresolved");
});
test("all renderer participant and judge context builders reject unfinished speech",()=>{
 for(const status of ["pending","transcribing","unresolved","simulated",undefined]){const c=harness.load(["buildAiJudgeQuestionPrompt","buildAiTurnPrompt"],{state:{transcript:[{kind:"ai",text:"PRIVATE_TAIL",speechDeliveryState:status}],cases:{1:{title:"Case",question:"Why?",text:"Narrative"}},leadByCase:{1:"ai"}}});assert.throws(()=>c.buildAiJudgeQuestionPrompt(1,1),/verified delivered transcript/);for(const phase of [{kind:"speech",subtype:"presentation",caseNum:1,speaker:"ai",duration:300},{kind:"judgeAnswer",caseNum:1,speaker:"ai",duration:140,judgeNumber:1}])assert.throws(()=>c.buildAiTurnPrompt(phase),/verified delivered transcript/);}
});
test("failed cropped-audio recognition remains unresolved without full-audio/source fallback",async()=>{
 const message={};delivery.attach(message,"PRIVATE_TAIL",["PRIVATE_TAIL"]);delivery.registerSpokenTranscript(message,0,{transcriptText:"Full audio includes future words."});delivery.beginSpokenCutoff(message);
 const decoded={length:8,sampleRate:4,numberOfChannels:1,getChannelData:()=>new Float32Array(8)},state={matchRunId:3,timingTestAudioContext:{state:"running",decodeAudioData:async()=>decoded}},calls=[];
 const c=harness.load(["finalizeActualAudioCutoff"],{state,window:{ethicsApi:{audio:{speech:async()=>{},transcribe:async()=>{},alignSpeech:async request=>{calls.push(request);throw Error("ASR failed");}}}},setStatus(){},renderTranscript(){},updateComposerModeIndicator(){}});
 await assert.rejects(c.finalizeActualAudioCutoff(message,{audioBytes:new Uint8Array([1,2]),entry:{text:"PRIVATE_TAIL"}},.75,3),/ASR failed/);assert.equal(calls.length,1);assert.equal(calls[0].bytes.length,50);assert.equal(calls[0].durationSeconds,.75);assert.equal(message.text,"");assert.equal(message.speechDeliveryState,"unresolved");assert.equal(contexts.isReady([message]),false);
});
test("judge question request propagates the 75-word maximum without exact-word target or repair",async()=>{
 for(const locale of ["en","fr-ca"]){const requests=[],state={locale,matchRunId:4};const c=harness.load(["ensureAiJudgeQuestion"],{state,buildAiJudgeQuestionPrompt:()=>prompts.buildJudgeQuestionPrompt({judgeNumber:1,locale,questionedParticipant:"Alex"}),callAI:async request=>{requests.push(request);return {question:"Why?"};},getJudgeModel:()=>"gpt-6-astra"});assert.equal(await c.ensureAiJudgeQuestion(1,1),"Why?");assert.equal(requests.length,1);assert.match(requests[0].userPrompt,/in no more than 75 words/);assert.doesNotMatch(requests[0].userPrompt,/Write exactly|exactly 75|regenerat|rewrite/);assert.equal(requests[0].systemPrompt,"");}
});
