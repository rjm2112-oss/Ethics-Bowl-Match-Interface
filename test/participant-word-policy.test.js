"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),h=require('./helpers/renderer-harness'),catalog=require('../src/shared/model-catalog'),prompts=require('../src/shared/ai-turn-prompt'),phasesApi=require('../src/shared/match-phases');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createProviderService}=require('../src/main/provider-service'),{createGenerationRecords}=require('../src/main/generation-records');
const participantPhases=locale=>phasesApi.build({leadByCase:{1:'human',2:'ai'},locale}).filter(p=>p.kind==='speech'||p.kind==='judgeAnswer');
const words=(count,marker='word')=>Array(count).fill(marker).join(' ');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture({locale='en',model='gpt-6-luna',generate,credentials=async()=>{}}={}){
 const calls=[],audio=[],messages=[],statuses=[];
 const phases=participantPhases(locale),state={matchRunId:10,started:true,phaseReady:true,currentPhaseIndex:0,names:{human:'Alex',ai:'Morgan'},participantTypes:{human:'ai',ai:'ai'},participantModels:{human:model,ai:model},leadByCase:{1:'human',2:'ai'},phases,cases:{1:{title:'One',question:'Should we?',text:'Complete case one.'},2:{title:'Two',question:'Why?',text:'Complete case two.'}},transcript:[{kind:'ai',label:'Alex',text:'Earlier delivered discussion.',speechDeliveryState:'complete'}],askedJudgeQuestions:Object.fromEntries(phases.filter(p=>p.kind==='judgeAnswer').map(p=>[p.id,'Original question?']))};
 const c=h.load(['maybePrepareAiTurnForPhase','generateAiTurnForPhase','countWords','resetStateForNewMatch','callAI','substantiveTranscriptAsPlainText'],{state,activeLocale:locale,document:{createElement:()=>({})},refreshControls(){},window:{EthicsMatchSession:require('../src/shared/match-session'),ethicsApi:{ai:{generate:async request=>{calls.push(request);return generate(request,calls.length);}}}},refreshCredentialStatus:credentials,hasCredential:()=>true,formatModelLabel:v=>v,localStorage:{getItem:()=> 'Optional instruction exactly as saved.'},primeWholeSpeechAudioForPhase:(p,text)=>audio.push({phaseId:p.id,text}),maybeCompletePreparedAiConferral(){},appendParticipantMessage:(role,text)=>{messages.push({role,text});state.transcript.push({kind:'ai',label:role,text,speechDeliveryState:'complete'});},setBusy:v=>{state.busy=v;},setStatus:(...args)=>statuses.push(args),console:{error(){}},stopSpeechPlayback(){},releaseMicrophoneStream(){},stopTimer(){},renderTranscript(){},clearScoreboard(){},refreshTimingTestUi(){},phaseListEl:{innerHTML:'',appendChild(){}},participantOneTypeSelectEl:{value:'ai'},participantTwoTypeSelectEl:{value:'ai'},participantOneModelSelectEl:{value:model},modelSelectEl:{value:model},moderatorReadFullCaseSelectEl:{value:'no'}});
 return {c,state,calls,audio,messages,statuses,phases};
}

test('app word count is deterministic for English/French apostrophes, hyphens, numbers and punctuation',()=>{
 const f=fixture();assert.equal(f.c.countWords("L’équipe n'a qu'un porte-parole; 42 idées — oui!"),7);assert.equal(f.c.countWords("Don't re-write 42 answers… now."),5);assert.equal(f.c.countWords('... — !!!'),0);
});

test('inclusive +/-10% boundaries and adjacent misses across both languages, providers and all twelve contestant phases',async()=>{
 for(const locale of ['en','fr-ca'])for(const model of ['gpt-6-luna','claude-haiku-5-5'])for(const phase of participantPhases(locale)){
  const target=prompts.getWordTarget({duration:phase.duration,locale}).target,lower=Math.ceil(target*.9),upper=Math.floor(target*1.1);
  for(const count of [lower,upper,lower-1,upper+1]){
   const f=fixture({locale,model,generate:async(_r,attempt)=>words(attempt===1?count:target,attempt===1?'INITIAL':'SELECTED')});
   const result=await f.c.maybePrepareAiTurnForPhase(phase),miss=count<lower||count>upper;
   assert.equal(f.calls.length,miss?2:1,`${locale}/${model}/${phase.id}/${count}`);assert.equal(f.c.countWords(result),miss?target:count);assert.equal(f.audio.length,1);assert.equal(f.audio[0].text,result);
   assert.equal(f.state.transcript.length,1,'preparation adds no participant/judge transcript');assert.equal(f.messages.length,0);
   const original=f.calls[0];assert.ok(original.userPrompt.endsWith(`Write exactly ${target} words.`));assert.equal((original.userPrompt.match(/Write exactly \d+ words\./g)||[]).length,1);
   if(miss){const retry=f.calls[1];for(const key of ['systemPrompt','userPrompt','model','reasoningEffort','maxTokens','requestTimeoutMs'])assert.equal(retry[key],original[key],key);assert.doesNotMatch(retry.userPrompt,/INITIAL|SELECTED|word count|first draft|revise|rewrite|countdown/i);assert.equal(retry.recordContext.contentAttempt,2);assert.doesNotMatch(f.audio[0].text,/INITIAL/);}
  }
 }
});

test('two misses select only the second complete answer before TTS/transcript and cache it without a loop',async()=>{
 const f=fixture({generate:async(_r,n)=>words(n===1?800:900,n===1?'DISCARDED':'SECOND')});const p=f.phases[0];
 assert.equal(await f.c.generateAiTurnForPhase(p),true);assert.equal(f.calls.length,2);assert.equal(f.audio.length,1);assert.equal(f.messages.length,1);assert.equal(f.c.countWords(f.messages[0].text),900);assert.doesNotMatch(f.c.substantiveTranscriptAsPlainText(),/DISCARDED/);assert.match(f.c.substantiveTranscriptAsPlainText(),/SECOND/);
 // The selected second complete answer is still subject to the existing phase timer.
 assert.equal(p.duration,300);assert.equal(f.state.phaseAwaitingPlaybackForId,p.id);
 const g=fixture({generate:async(_r,n)=>words(n===1?800:900,n===1?'DISCARDED':'SECOND')});await g.c.maybePrepareAiTurnForPhase(p);await g.c.maybePrepareAiTurnForPhase(p);assert.equal(g.calls.length,2);assert.equal(g.audio.length,1);assert.equal(g.state.aiPreparedTurns[p.id].contentAttempt,2);
});

test('pending content retry has no discarded audio/text and freezes model, language and optional instructions before the first response',async()=>{
 const first=deferred(),second=deferred(),f=fixture({generate:async(_r,n)=>n===1?first.promise:second.promise});const p=f.phases[0],pending=f.c.maybePrepareAiTurnForPhase(p);await new Promise(setImmediate);assert.equal(f.calls.length,1);
 f.state.participantModels.human='gpt-6-astra';f.state.locale='fr-ca';f.c.localStorage.getItem=()=> 'CHANGED OPTIONAL INSTRUCTIONS';first.resolve(words(800,'DISCARDED'));await new Promise(setImmediate);
 assert.equal(f.calls.length,2);assert.equal(f.audio.length,0);assert.equal(f.messages.length,0);assert.equal(Object.keys(f.state.aiPreparedTurns).length,0);
 for(const key of ['model','reasoningEffort','systemPrompt','userPrompt'])assert.equal(f.calls[1][key],f.calls[0][key]);assert.doesNotMatch(f.calls[1].systemPrompt,/CHANGED/);second.resolve(words(700,'SELECTED'));await pending;assert.equal(f.audio.length,1);
});

for(const where of ['first','retry'])for(const cancel of ['reset','close','interrupt','complete'])test(`${cancel} during ${where} request stops further content retry and discards late text without TTS`,async()=>{
 const wait=deferred(),f=fixture({generate:async(_r,n)=>where==='first'||n===2?wait.promise:words(800,'DISCARDED')});const p=f.phases[0],pending=f.c.maybePrepareAiTurnForPhase(p);await new Promise(setImmediate);assert.equal(f.calls.length,where==='first'?1:2);
 if(cancel==='reset')f.c.resetStateForNewMatch();else if(cancel==='close')f.state.sessionClosed=true;else if(cancel==='interrupt')f.state.interruptedPhaseIds.add(p.id);else f.state.completed=true;
 wait.resolve(words(800,'LATE'));assert.equal(await pending,'');assert.equal(f.calls.length,where==='first'?1:2);assert.equal(f.audio.length,0);assert.equal(f.messages.length,0);assert.deepEqual(f.state.aiPreparedTurns,{});assert.deepEqual(f.state.aiPreparationErrors,{});
});

test('changed judge question before retry or during retry discards obsolete answers without audio',async()=>{
 for(const where of ['first','retry']){
  const wait=deferred(),f=fixture({generate:async(_r,n)=>where==='first'||n===2?wait.promise:words(500,'DISCARDED')});const p=f.phases.find(p=>p.kind==='judgeAnswer'),pending=f.c.maybePrepareAiTurnForPhase(p);await new Promise(setImmediate);f.state.askedJudgeQuestions[p.id]='Changed question?';wait.resolve(words(330));await assert.rejects(pending,/question changed/);assert.equal(f.audio.length,0);assert.equal(Object.keys(f.state.aiPreparedTurns).length,0);assert.equal(f.calls.length,where==='first'?1:2);
 }
});

test('retry failure is explicit, no fallback to discarded text and no third complete-answer request',async()=>{
 for(const provider of ['openai','anthropic']){
  let fetches=0;const attempts=[];const service=createProviderService({credentialStore:{get:async()=> 'test-only-key'},sleep:async()=>{},fetchImpl:async(_url,opts)=>{fetches++;attempts.push(opts.recordContext.contentAttempt);if(opts.recordContext.contentAttempt===2)return new Response(JSON.stringify({error:{message:'Temporary failure'}}),{status:503,headers:{'content-type':'application/json'}});return new Response(JSON.stringify(provider==='openai'?{status:'completed',output_text:words(800)}:{stop_reason:'end_turn',content:[{type:'text',text:words(800)}]}),{headers:{'content-type':'application/json'}});}});
  const f=fixture({model:provider==='openai'?'gpt-6-luna':'claude-haiku-5-5',generate:r=>service.generate(r)});await assert.rejects(f.c.maybePrepareAiTurnForPhase(f.phases[0]),/Fresh answer retry failed/);assert.equal(f.calls.length,2);assert.equal(fetches,4,'one initial plus separate bounded three technical attempts');assert.deepEqual(attempts,[1,2,2,2]);assert.equal(f.audio.length,0);assert.equal(f.messages.length,0);assert.equal(Object.keys(f.state.aiPreparedTurns).length,0);assert.match(f.state.aiPreparationErrors[f.phases[0].id],/Fresh answer retry failed/);
 }
});

test('both provider ledgers retain discarded output and usage under unique IDs while byte-identical fresh prompts exclude it',async()=>{
 for(const provider of ['openai','anthropic']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ethics-policy-ledger-')),audit=[],bodies=[];
  try{
   const service=createProviderService({credentialStore:{get:async()=> 'test-only-key'},recordStore:createGenerationRecords(directory),auditSink:e=>audit.push(e),fetchImpl:async(_url,opts)=>{const body=JSON.parse(opts.body);bodies.push(body);const text=words(bodies.length===1?800:700,bodies.length===1?'PRIVATE_DISCARDED':'SELECTED');return new Response(JSON.stringify(provider==='openai'?{id:'mock-'+bodies.length,status:'completed',output_text:text,usage:{input_tokens:30,output_tokens:800}}:{id:'mock-'+bodies.length,stop_reason:'end_turn',content:[{type:'text',text}],usage:{input_tokens:30,output_tokens:800}}),{headers:{'content-type':'application/json'}});}});
   const f=fixture({model:provider==='openai'?'gpt-6-luna':'claude-haiku-5-5',generate:r=>service.generate(r)});await f.c.generateAiTurnForPhase(f.phases[0]);assert.equal(bodies.length,2);assert.deepEqual(bodies[1],bodies[0]);assert.doesNotMatch(JSON.stringify(bodies),/PRIVATE_DISCARDED/);const started=audit.filter(e=>e.event==='request_started'),received=audit.filter(e=>e.event==='response_received');assert.equal(new Set(started.map(e=>e.id)).size,2);assert.deepEqual(started.map(e=>e.context.contentAttempt),[1,2]);assert.equal(received.length,2);assert.ok(received.every(e=>e.usage.output_tokens===800));
   const saved=started.map(e=>JSON.parse(fs.readFileSync(path.join(directory,e.id+'.response.json'),'utf8')));assert.match(JSON.stringify(saved[0].data),/PRIVATE_DISCARDED/);assert.match(JSON.stringify(saved[1].data),/SELECTED/);assert.doesNotMatch(JSON.stringify(f.messages),/PRIVATE_DISCARDED/);assert.doesNotMatch(JSON.stringify(f.audio),/PRIVATE_DISCARDED/);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
 }
});

test('outer UI surfaces failed fresh retry and blocks automatic regeneration',async()=>{
 const f=fixture({generate:async(_r,n)=>{if(n===1)return words(800);throw Error('Mock retry exhausted');}}),p=f.phases[0];
 assert.equal(await f.c.generateAiTurnForPhase(p),false);assert.equal(f.calls.length,2);assert.equal(f.audio.length,0);assert.equal(f.messages.length,0);assert.equal(f.state.autoGenerationBlockedPhaseId,p.id);assert.equal(f.statuses.at(-1)[1],true);assert.match(f.statuses.at(-1)[0],/Fresh answer retry failed: Mock retry exhausted/);
});

test('initial technical failure does not start a content retry',async()=>{
 const f=fixture({generate:async()=>{throw Error('Mock initial transport failure');}});await assert.rejects(f.c.maybePrepareAiTurnForPhase(f.phases[0]),/initial transport failure/);assert.equal(f.calls.length,1);assert.equal(f.audio.length,0);
});

test('reset during retry credential lookup prevents its physical provider request',async()=>{
 const credential=deferred();let reads=0;const f=fixture({generate:async()=>words(800),credentials:()=>++reads===2?credential.promise:Promise.resolve()});
 const pending=f.c.maybePrepareAiTurnForPhase(f.phases[0]);await new Promise(setImmediate);assert.equal(reads,2);assert.equal(f.calls.length,1);f.c.resetStateForNewMatch();credential.resolve();assert.equal(await pending,'');assert.equal(f.calls.length,1);assert.equal(f.audio.length,0);
});

test('diagnostic content-attempt context is validated and never becomes prompt text',()=>{
 const {validateGenerateRequest}=require('../src/main/validation'),base={model:'gpt-6-luna',userPrompt:'Original prompt',recordContext:{phaseId:'case1-presentation',matchRunId:10,wordTarget:700,contentAttempt:2}};
 assert.deepEqual(validateGenerateRequest(base).recordContext,base.recordContext);assert.equal(validateGenerateRequest(base).userPrompt,'Original prompt');
 for(const bad of [0,3,-1,1.5,'2'])assert.throws(()=>validateGenerateRequest({...base,recordContext:{...base.recordContext,contentAttempt:bad}}),/Content attempt/);
});
