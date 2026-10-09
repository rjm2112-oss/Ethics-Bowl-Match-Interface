"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createProviderService}=require("../src/main/provider-service");
const {createAuditedFetch}=require("../src/main/api-audit");
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","x-request-id":"request-"+status}});
test("every physical retry and output-budget recovery retains usage before validation, without keys",async()=>{
 const audit=[];let count=0;
 const service=createProviderService({credentialStore:{get:async()=>"sk-private_never_in_audit"},auditSink:event=>audit.push(event),sleep:async()=>{},fetchImpl:async()=>{
  count++;if(count===1)return json({error:{code:"rate_limit"},usage:{input_tokens:3,output_tokens:0}},429);
  if(count===2)return json({status:"incomplete",incomplete_details:{reason:"max_output_tokens"},usage:{input_tokens:10,output_tokens:25000,input_tokens_details:{cached_tokens:2,cache_write_tokens:3},output_tokens_details:{reasoning_tokens:24000}}});
  return json({status:"completed",output_text:"Completed answer",usage:{input_tokens:12,output_tokens:2000}});
 }});
 assert.equal(await service.generate({model:"gpt-6-luna",userPrompt:"Answer",maxTokens:800,reasoningEffort:"high"}),"Completed answer");
 assert.equal(audit.filter(e=>e.event==="request_started").length,3);const responses=audit.filter(e=>e.event==="response_received");assert.equal(responses.length,3);assert.equal(responses[1].usage.output_tokens,25000);assert.equal(responses[1].usage.output_tokens_details.reasoning_tokens,24000);assert.equal(responses[0].status,429);assert.equal(responses[2].requestId,"request-200");assert.doesNotMatch(JSON.stringify(audit),/sk-private|Authorization|Bearer/);
});
test("audio without usage is explicitly unavailable and network failures retain unknown billing state",async()=>{
 const audit=[];const fetch=createAuditedFetch({auditSink:e=>audit.push(e),fetchImpl:async()=>new Response(new Uint8Array([1,2,3]),{headers:{"content-type":"audio/mpeg"}})});
 const response=await fetch("https://api.openai.com/v1/audio/speech",{body:JSON.stringify({model:"gpt-4o-mini-tts",input:"Text",voice:"alloy"})});assert.equal((await response.arrayBuffer()).byteLength,3);assert.equal(audit[1].exactAudioUsageUnavailable,true);assert.equal(audit[1].usage,null);
 const fail=createAuditedFetch({auditSink:e=>audit.push(e),fetchImpl:async()=>{throw new TypeError("socket");}});await assert.rejects(fail("https://api.openai.com/v1/responses",{body:JSON.stringify({model:"gpt-6-luna",input:"Text"})}));assert.equal(audit.at(-1).unknownBilledUsage,true);
});
test("structured output parse failure still records returned usage",async()=>{
 const audit=[];const service=createProviderService({credentialStore:{get:async()=>"test-key"},auditSink:e=>audit.push(e),fetchImpl:async()=>json({status:"completed",output_text:"unreadable",usage:{input_tokens:10,output_tokens:20}})});
 await assert.rejects(service.generate({model:"gpt-6-luna",userPrompt:"Score",jsonSchema:{name:"score",schema:{type:"object",properties:{}}}}),/structured JSON/);assert.equal(audit.at(-1).usage.output_tokens,20);
});
