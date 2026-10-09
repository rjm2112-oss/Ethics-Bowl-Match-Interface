"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createGenerationRecords}=require('../src/main/generation-records');
const {createProviderService}=require('../src/main/provider-service');
test('native generation records persist audio and original context before return and reuse it after reopening',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ethics-records-'));let calls=0;
 try{
 const store=createGenerationRecords(root),service=createProviderService({recordStore:store,credentialStore:{get:async()=> 'sk-secret_must_not_be_saved'},fetchImpl:async()=>{calls++;return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg','x-request-id':'request-audio'}});}});
 const payload={model:'gpt-4o-mini-tts',voice:'alloy',input:'Alex supports rights.',recordContext:{phaseId:'case1-presentation',kind:'ai',locale:'en',textModel:'gpt-6-luna',reasoningEffort:'high',originalText:'Alex supports rights.\n\nSecond paragraph.',wordTarget:700,chunkIndex:0,chunkCount:2}};
 const result=await service.speech(payload);assert.ok(result.recordId);assert.deepEqual([...result.bytes],[1,2,3]);
 const request=JSON.parse(fs.readFileSync(path.join(root,result.recordId+'.request.json')));assert.equal(request.context.originalText,payload.recordContext.originalText);assert.equal(request.context.wordTarget,700);assert.equal(request.body.input,payload.input);assert.equal(fs.readFileSync(path.join(root,result.recordId+'.mp3')).length,3);
 const next=createProviderService({recordStore:createGenerationRecords(root),credentialStore:{get:async()=> 'sk-secret_must_not_be_saved'},fetchImpl:async()=>{throw Error('Must not refetch cached speech');}});
 const replay=await next.speech(payload);assert.equal(replay.recordId,result.recordId);assert.equal(replay.cacheReused,true);assert.equal(calls,1);
 const saved=fs.readdirSync(root).filter(f=>f.endsWith('.json')||f.endsWith('.jsonl')).map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('');assert.doesNotMatch(saved,/sk-secret|Authorization|Bearer/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('raw actual recognition survives reopen and generated-source differences without a second request',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ethics-recognition-'));let calls=0;try{
 const create=()=>createProviderService({recordStore:createGenerationRecords(root),credentialStore:{get:async()=> 'test-only'},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({text:'Alex rights',words:[{word:'Alex',start:0,end:1},{word:'rights',start:1,end:2}],duration:3,usage:{type:'duration',seconds:3}}),{headers:{'content-type':'application/json'}});}});
 const payload={bytes:[1,2,3],mimeType:'audio/mpeg',originalText:'Alex supports rights PRIVATE_TAIL',durationSeconds:3,language:'en'};
 assert.equal((await create().alignSpeech(payload)).transcriptText,'Alex rights');assert.equal((await create().alignSpeech({...payload,originalText:'Changed private source'})).transcriptText,'Alex rights');assert.equal(calls,1);
 const responses=fs.readdirSync(root).filter(name=>name.endsWith('.response.json'));const raw=JSON.parse(fs.readFileSync(path.join(root,responses[0])));assert.equal(raw.data.text,'Alex rights');assert.equal(raw.version,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('durable playback manifests distinguish generated, played and stopped prefixes without changing source data',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ethics-playback-record-'));try{
 const store=createGenerationRecords(root);store.recordPlayback({event:'generated_audio',phaseId:'case1-presentation',originalText:'Alex protects rights. PRIVATE_UNPLAYED_TAIL',naturalDurationSeconds:5});store.recordPlayback({event:'playback_stopped',phaseId:'case1-presentation',mediaTime:2,deliveredPrefix:'Alex protects',deliveryState:'cutoff'});
 const events=fs.readFileSync(path.join(root,'manifest.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(events[0].event,'generated_audio');assert.match(events[0].originalText,/PRIVATE_UNPLAYED_TAIL/);assert.equal(events[1].deliveredPrefix,'Alex protects');assert.throws(()=>store.recordPlayback({event:'credential'}),/Unknown/);
 for(const event of ['playback_skipped','playback_skip_to_limit'])assert.deepEqual(store.recordPlayback({event,mediaTime:2,through:5}),{recorded:true});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('obsolete fidelity replacement is rejected before any provider request; old record formats are never migrated',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ethics-new-records-'));try{
 const service=createProviderService({credentialStore:{get:async()=> 'test-only'},fetchImpl:async()=>{throw Error('Provider must not be called');}});
 await assert.rejects(service.speech({input:'Same source.',fidelityRetryOf:'11111111-1111-1111-1111-111111111111'}),/not a supported request/);
 fs.writeFileSync(path.join(root,'old.json'),'{}');assert.throws(()=>createGenerationRecords(root),/new empty recording directory/);assert.equal(fs.readFileSync(path.join(root,'old.json'),'utf8'),'{}');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
