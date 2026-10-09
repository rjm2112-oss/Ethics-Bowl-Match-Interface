"use strict";
const {createHash,randomUUID}=require("node:crypto");
const {appendFileSync,mkdirSync}=require("node:fs");
const path=require("node:path");
function createFileAuditSink(filePath){
    mkdirSync(path.dirname(filePath),{recursive:true});
    return event=>appendFileSync(filePath,JSON.stringify(event)+"\n",{mode:0o600});
}
function requestMetadata(url,options){
    const metadata={endpoint:new URL(url).pathname,provider:new URL(url).hostname.includes("anthropic")?"anthropic":"openai"};
    if(typeof options.body==="string"){
        const body=JSON.parse(options.body);
        metadata.model=body.model;
        metadata.reasoningEffort=body.reasoning?.effort||body.output_config?.effort||null;
        metadata.maxOutputTokens=body.max_output_tokens||body.max_tokens||null;
        metadata.inputCharacters=String(body.input||body.messages?.[0]?.content||"").length;
        metadata.requestHash=createHash("sha256").update(options.body).digest("hex");
        metadata.speechCharacters=body.voice?String(body.input||"").length:0;
        metadata.voice=body.voice||null;
    }else if(options.body?.get){
        metadata.model=options.body.get("model");
        metadata.wordTimestamps=options.body.get("timestamp_granularities[]")==="word";
        metadata.audioBytes=options.body.get("file")?.size||null;
        metadata.sourceCharacters=String(options.body.get("prompt")||"").length;
    }
    return metadata;
}
function createAuditedFetch({fetchImpl=globalThis.fetch,auditSink,recordStore}){
    if(typeof auditSink!=="function" && !recordStore)return fetchImpl;
    const audit=typeof auditSink==="function"?auditSink:()=>{};
    return async(url,options)=>{
        const id=randomUUID(),startedAt=new Date().toISOString(),started=Date.now();
        const metadata=requestMetadata(url,options);
        recordStore?.request(id,{id,startedAt,...metadata},typeof options.body==="string"?JSON.parse(options.body):null,options.recordContext);
        audit({event:"request_started",id,startedAt,...metadata,context:options.recordContext||null});
        let response;
        try{response=await fetchImpl(url,options);}catch(error){
            const failure={event:"request_failed",id,completedAt:new Date().toISOString(),latencyMs:Date.now()-started,errorType:error?.name||"Error",unknownBilledUsage:true};recordStore?.response(id,failure);audit(failure);throw error;
        }
        // Clone and capture usage before parsing/status/schema checks or retries.
        const event={event:"response_received",id,completedAt:new Date().toISOString(),status:response.status,requestId:response.headers?.get?.("x-request-id")||response.headers?.get?.("request-id")||null};
        try{
            if(String(response.headers?.get?.("content-type")||"").includes("json")){
                const data=await response.clone().json();
                event.responseId=data.id||null;event.model=data.model||metadata.model;event.usage=data.usage||null;
                event.responseStatus=data.status||data.stop_reason||null;
                event.incompleteDetails=data.incomplete_details||null;
                event.errorCode=data.error?.code||data.error?.type||null;
                event.audioDurationSeconds=Number.isFinite(data.duration)?data.duration:null;
                // Full successful generation output stays in private diagnostics,
                // never in the scoring transcript. Provider error bodies may echo
                // secrets, so only their already sanitized metadata is retained.
                recordStore?.response(id,event,response.ok?data:null);
            }else{
                const bytes=new Uint8Array(await response.clone().arrayBuffer());
                event.audioResponseBytes=bytes.byteLength;
                recordStore?.response(id,event,null,response.ok?bytes:null);
                event.usage=null;event.exactAudioUsageUnavailable=true;
            }
        }catch(error){event.bodyAuditError=error?.name||"Error";event.unknownBilledUsage=true;if(recordStore){audit(event);throw new Error("Could not persist the generation response before playback.");}}
        event.latencyMs=Date.now()-started;
        audit(event);
        response.ethicsRecordId=id;
        return response;
    };
}
module.exports={createFileAuditSink,createAuditedFetch};
