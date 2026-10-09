"use strict";

const {createAuditedFetch} = require("./api-audit");
const { createAnthropicAdapter } = require("./providers/anthropic");
const { createOpenAiAdapter } = require("./providers/openai");
const {createHash} = require("node:crypto");
const WORD_ALIGNMENT = require("../shared/word-alignment");
const {
    validateAlignmentRequest,
    validateGenerateRequest,
    validateSpeechRequest,
    validateTranscriptionRequest
} = require("./validation");

function createProviderService({ credentialStore, fetchImpl = globalThis.fetch, sleep, auditSink, recordStore } = {}) {
    if (!credentialStore || typeof credentialStore.get !== "function") throw new Error("A credential store is required.");
    const auditedFetch = createAuditedFetch({fetchImpl,auditSink,recordStore});
    const openai = createOpenAiAdapter({ fetchImpl:auditedFetch, sleep, recordStore });
    const anthropic = createAnthropicAdapter({ fetchImpl:auditedFetch, sleep, recordStore });

    async function requireKey(provider) {
        const key = await credentialStore.get(provider);
        if (!key) throw new Error("No API key is configured for the selected model's provider.");
        return key;
    }

    async function generate(payload) {
        const request = validateGenerateRequest(payload);
        const key = await requireKey(request.provider);
        if (request.provider === "openai") return openai.generate(request, key);
        if (request.provider === "anthropic") return anthropic.generate(request, key);
        throw new Error("That AI provider is not supported.");
    }

    async function speech(payload) {
        const request = validateSpeechRequest(payload);
        return openai.speech(request, await requireKey("openai"));
    }

    async function transcribe(payload) {
        const request = validateTranscriptionRequest(payload);
        return openai.transcribe(request, await requireKey("openai"));
    }

    const recognitions=new Map();
    async function alignSpeech(payload) {
        const request=validateAlignmentRequest(payload);
        // Audio identity and recognition parameters are independent of generated text.
        const hash=createHash("sha256").update(request.bytes).update(JSON.stringify([request.language,request.model,request.durationSeconds])).digest("hex");
        if(!recognitions.has(hash)) {
            const promise=(async()=>{
                const recognition=recordStore?.cachedRecognition(hash)||await openai.transcribe({...request,prompt:"",recordContext:{recognitionHash:hash,speechRecordId:request.recordId,language:request.language,recognitionMode:"no-source-prompt"}},await requireKey("openai"));
                let alignment=null,timingError=null;
                try{alignment=WORD_ALIGNMENT.alignRecognized(recognition.text,recognition.words,request.durationSeconds,request.language||"en");}catch(error){timingError=error.message;}
                return {policy:"spoken-audio",transcriptText:recognition.text,recognitionRecordId:recognition.recordId||null,alignment,timingError,estimatedWordTimestamps:true};
            })();
            recognitions.set(hash,promise);
        }
        const pending=recognitions.get(hash);
        try {
            const result=await pending;
            recordStore?.spokenTranscript(request.recordId,result,{originalGeneratedText:request.originalText,audioDurationSeconds:request.durationSeconds,recognitionHash:hash});
            return result;
        } catch(error){if(recognitions.get(hash)===pending)recognitions.delete(hash);throw error;}
        finally{if(recognitions.size>512)recognitions.delete(recognitions.keys().next().value);}
    }
    return Object.freeze({ generate, speech, transcribe, alignSpeech, recordSpeechEvent:payload=>recordStore?recordStore.recordPlayback(payload):{recorded:false} });
}

module.exports = { createProviderService };
