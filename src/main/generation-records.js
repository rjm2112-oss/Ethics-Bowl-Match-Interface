"use strict";
const fs=require("node:fs"),path=require("node:path");
const VERSION=1;
const PLAYBACK_EVENTS=new Set(["generated_audio","playback_started","playback_paused","playback_resumed","playback_ended","playback_stopped","speech_plan","delivery_finalized"]);
function createGenerationRecords(directory) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    const format=path.join(directory,"format.json"),requests=new Map(),audioByHash=new Map(),recognitionByHash=new Map();
    const validId=id=>typeof id==="string"&&/^[a-f0-9-]{36}$/.test(id);
    const requireId=id=>{if(!validId(id))throw Error("Invalid generation record ID.");};
    function save(file,value) {
        const target=path.join(directory,file),temporary=target+".tmp";
        fs.writeFileSync(temporary,JSON.stringify(value,null,2)+"\n",{mode:0o600});fs.renameSync(temporary,target);
    }
    const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file),"utf8"));
    const event=value=>fs.appendFileSync(path.join(directory,"manifest.jsonl"),JSON.stringify({version:VERSION,at:new Date().toISOString(),...value})+"\n",{mode:0o600});
    if(fs.existsSync(format)){if(read("format.json").version!==VERSION)throw Error("Unsupported recording format.");}
    else {if(fs.readdirSync(directory).length)throw Error("A new empty recording directory is required.");save("format.json",{version:VERSION});}
    function index(id,request,response) {
        if(response.version!==VERSION)throw Error("Unsupported generation response format.");
        if(response.status>=200&&response.status<300) {
            if(response.audioFile && request.requestHash && fs.existsSync(path.join(directory,response.audioFile)))audioByHash.set(request.requestHash,id);
            if(typeof response.data?.text==="string" && response.data.text.trim() && Array.isArray(response.data.words) && !(response.data.segments||[]).some(segment=>segment.avg_logprob < -1 || segment.compression_ratio > 2.4) && request.context?.recognitionHash)recognitionByHash.set(request.context.recognitionHash,id);
        }
    }
    const entries=fs.readdirSync(directory).filter(file=>file.endsWith(".request.json")).map(file=>{
        const id=file.slice(0,-13);requireId(id);const request=read(file);if(request.version!==VERSION)throw Error("Unsupported generation request format.");return {id,request};
    }).sort((a,b)=>a.request.startedAt.localeCompare(b.request.startedAt));
    for(const {id,request} of entries){requests.set(id,request);if(fs.existsSync(path.join(directory,id+".response.json")))index(id,request,read(id+".response.json"));}
    return Object.freeze({
        request(id,metadata,body,context) {requireId(id);const request={version:VERSION,...metadata,body,context:context||null};save(id+".request.json",request);requests.set(id,request);event({event:"generation_request",id,model:metadata.model,context:context||null});},
        response(id,metadata,data,audioBytes) {
            requireId(id);if(!requests.has(id))throw Error("Generation request must be recorded first.");
            const response={version:VERSION,...metadata};if(data)response.data=data;
            if(audioBytes){const file=id+".mp3";fs.writeFileSync(path.join(directory,file),audioBytes,{mode:0o600});response.audioFile=file;}
            save(id+".response.json",response);index(id,requests.get(id),response);event({event:"generation_response",id,status:metadata.status,audioFile:response.audioFile||null});
        },
        cachedSpeech(hash,context) {
            const id=audioByHash.get(hash);if(!id)return null;const response=read(id+".response.json");
            const bytes=new Uint8Array(fs.readFileSync(path.join(directory,response.audioFile)));event({event:"speech_cache_reuse",id,context:context||null});return {bytes,mimeType:"audio/mpeg",recordId:id,cacheReused:true};
        },
        cachedRecognition(hash) {
            const id=recognitionByHash.get(hash);if(!id)return null;const response=read(id+".response.json");event({event:"recognition_cache_reuse",id});return {...response.data,recordId:id};
        },
        spokenTranscript(id,transcript,context) {
            if(!id)return;requireId(id);
            const file=id+".spoken-transcript-"+context.recognitionHash.slice(0,12)+".json";
            save(file,{version:VERSION,at:new Date().toISOString(),...transcript,...context});event({event:"spoken_audio_recognition",recordId:id,file,transcriptText:transcript.transcriptText,recognitionRecordId:transcript.recognitionRecordId,sourceDiffers:transcript.transcriptText!==context.originalGeneratedText,timingError:transcript.timingError||null});
        },
        recordPlayback(payload) {
            if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Error("Speech record must be an object.");
            if(JSON.stringify(payload).length>250000)throw Error("Speech record is too large.");
            if(!PLAYBACK_EVENTS.has(payload.event))throw Error("Unknown speech record event.");
            if(payload.recordId)requireId(payload.recordId);event(payload);return {recorded:true};
        }
    });
}
module.exports={createGenerationRecords};
