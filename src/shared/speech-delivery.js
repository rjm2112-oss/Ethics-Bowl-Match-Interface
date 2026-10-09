(function expose(root, factory) {
    const value = factory(typeof module === "object" && module.exports ? require("./word-alignment") : root.EthicsWordAlignment);
    if (typeof module === "object" && module.exports) module.exports = value;
    if (root) root.EthicsSpeechDelivery = value;
})(typeof globalThis === "object" ? globalThis : this, function (wordAlignment) {
    "use strict";
    const sources=new WeakMap();
    const normalize=text=>String(text||"").replace(/\s+/g," ").trim();
    function attach(message,originalText,chunks,locale="en",{displayOnly=false}={}) {
        if(!message || sources.has(message))throw Error("Speech delivery is already attached or invalid.");
        const parts=chunks.map(normalize),normalized=normalize(originalText);
        if(!parts.length || parts.some(part=>!part) || parts.join(" ")!==normalized)throw Error("Speech chunks do not exactly cover the original text.");
        const preview=String(originalText||""),normToRaw=[];let cursor=0;
        for(const token of preview.matchAll(/\S+/gu)){
            if(cursor)normToRaw[cursor++]=token.index;
            for(let char=0;char<token[0].length;char++)normToRaw[cursor++]=token.index+char;
        }
        let offset=0;const chunkOffsets=parts.map(part=>{const start=offset;offset+=part.length+1;return start;});
        sources.set(message,{normalized,preview,locale,normToRaw,chunkOffsets,wordCount:normalized.split(" ").length,parts,recognized:[],completed:[],next:0,closed:false,displayOnly});
        if(!displayOnly){message.text="";message.speechDeliveryState="pending";}
    }
    function has(message){return sources.has(message);}
    // Display-only generated preview. It never enters message.text or model context.
    function previewText(message){const source=sources.get(message);return source && !source.closed && (source.displayOnly || message.speechDeliveryState==="pending") ? source.preview : null;}
    function displayText(message){return sources.get(message)?.displayText??null;}
    function saveDisplayText(message,source){source.displayText=wordAlignment.restoreParagraphs(source.preview,message.text,source.locale);source.preview="";}
    function isPreviewOnly(message){return sources.get(message)?.displayOnly===true;}
    function endPreview(message){const source=sources.get(message);if(!source?.displayOnly)return;source.closed=true;source.preview="";source.parts=[];source.recognized=[];}
    function matchesSource(message,text){return sources.get(message)?.normalized===normalize(text);}
    function wordCount(message){return sources.get(message)?.wordCount??0;}
    function registerSpokenTranscript(message,index,transcript) {
        const source=sources.get(message);
        if(!source || source.closed || !Number.isInteger(index) || index<source.next || index>=source.parts.length || typeof transcript?.transcriptText!=="string" || !transcript.transcriptText.trim())throw Error("The played audio needs a valid speech transcript.");
        const text=transcript.transcriptText.trim(),alignment=transcript.alignment||null;
        if(alignment && (alignment.text!==text || !Array.isArray(alignment.words)))throw Error("Word timestamps must describe the recognized speech.");
        const previewAlignment=transcript.previewAlignment||alignment,previous=source.recognized[index];
        const previewMap=previous?.previewAlignment===previewAlignment ? previous.previewMap : wordAlignment.mapPreviewWords(source.parts[index],previewAlignment,source.locale);
        source.recognized[index]={text,alignment,previewAlignment,previewMap};
    }
    function completeChunk(message,index) {
        const source=sources.get(message);
        if(!source || source.closed || (!source.displayOnly && message.speechDeliveryState!=="pending") || index!==source.next)return false;
        const recognized=source.recognized[index];if(!recognized)throw Error("The played audio needs a speech transcript.");
        source.completed.push(recognized.text);source.next++;if(!source.displayOnly)message.text=source.completed.join(" ");
        if(source.next===source.parts.length){message.speechDeliveryState="complete";source.closed=true;saveDisplayText(message,source);source.normalized="";source.parts=[];}
        return true;
    }
    function beginSpokenCutoff(message) {
        const source=sources.get(message);if(!source || source.closed || message.speechDeliveryState!=="pending")return false;
        source.closed=true;message.text=source.completed.join(" ");message.speechDeliveryState="transcribing";return true;
    }
    function finalizeSpokenCutoff(message,actualPartialText) {
        const source=sources.get(message);
        if(!source || !["transcribing","unresolved"].includes(message.speechDeliveryState) || typeof actualPartialText!=="string")return false;
        message.text=[...source.completed,actualPartialText.trim()].filter(Boolean).join(" ");message.speechDeliveryState="cutoff";saveDisplayText(message,source);source.normalized="";source.parts=[];source.recognized=[];return true;
    }
    function sealUnresolved(message) {
        const source=sources.get(message);
        if(!source || !["pending","transcribing"].includes(message.speechDeliveryState))return false;
        source.closed=true;message.text=source.completed.join(" ");saveDisplayText(message,source);message.speechDeliveryState="unresolved";return true;
    }
    function playedThrough(audio) {
        let covered=0;
        for(let i=0;i<(audio?.played?.length||0);i++){
            if(audio.played.start(i)>covered+.001)break;
            covered=Math.max(covered,audio.played.end(i));
        }
        return covered;
    }
    function recognizedProgress(recognized,completed,through) {
        const alignment=recognized?.alignment;
        if(!alignment || alignment.text!==recognized.text || !Array.isArray(alignment.words)
            || !Number.isFinite(through) || through<0)return null;
        let previousChar=0,previousStart=0,previousEnd=0,last=null;
        // Separate monotone starts/ends permit conservative zero-duration groups
        // sharing the next real word's endpoint; they are never interpolated.
        for(const word of alignment.words) {
            if(!Number.isInteger(word.startChar) || !Number.isInteger(word.endChar)
                || word.startChar<previousChar || word.endChar<=word.startChar || word.endChar>recognized.text.length
                || !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds)
                || word.startSeconds<previousStart || word.endSeconds<previousEnd || word.endSeconds<word.startSeconds)return null;
            previousChar=word.endChar;previousStart=word.startSeconds;previousEnd=word.endSeconds;
        }
        for(const word of alignment.words) {
            if(word.requiresFullPlayback || word.endSeconds>through)break;
            last=word;
        }
        const prefix=recognized.text.slice(0,last?.endChar||0);
        return {text:[completed,prefix].filter(Boolean).join(" "),last,offset:completed.length+(completed && prefix?1:0)};
    }
    // Read only a verified recognized chunk and media intervals actually played.
    // Timestamp endpoints are ASR estimates, so only completed words are released.
    function confirmedProgress(message,index,audio) {
        const source=sources.get(message);
        if(!source || source.closed || message.speechDeliveryState!=="pending" || index!==source.next
            || !Number.isFinite(audio?.currentTime) || audio.currentTime<0)return null;
        return recognizedProgress(source.recognized[index],source.completed.join(" "),Math.min(audio.currentTime,playedThrough(audio)));
    }
    function captureProgress(message,index,audio) {
        if(isPreviewOnly(message))return false;
        const progress=confirmedProgress(message,index,audio);
        if(!progress || message.text===progress.text)return false;
        message.text=progress.text;return true;
    }
    function highlightRange(message,index,audio) {
        const progress=confirmedProgress(message,index,audio);
        // Offsets refer to the public recognized transcript, never generated text.
        if(!progress?.last || typeof message.text!=="string" || !progress.text.startsWith(message.text))return null;
        // Media time can advance between publication and painting. Keep the last
        // displayed confirmed word, rather than blanking a valid previous word.
        const displayedEnd=message.text.length-progress.offset;
        const word=sources.get(message).recognized[index].alignment.words.find(candidate=>candidate.endChar===displayedEnd);
        if(!word || word.requiresFullPlayback || word.endChar>progress.last.endChar)return null;
        return {startChar:progress.offset+word.startChar,endChar:progress.offset+word.endChar};
    }
    function previewHighlightRange(message,index,audio) {
        const source=sources.get(message),recognized=source?.recognized[index],alignment=recognized?.previewAlignment;
        if(!source||source.closed||(!source.displayOnly&&message.speechDeliveryState!=="pending")||index!==source.next
            ||!alignment||!recognized.previewMap?.length||audio?.ended
            ||!Number.isFinite(audio?.currentTime)||audio.currentTime<0)return null;
        const through=playedThrough(audio),time=audio.currentTime;
        if(through<=0||time>through+.001)return null;
        for(let wordIndex=alignment.words.length-1;wordIndex>=0;wordIndex--){
            const word=alignment.words[wordIndex];
            if(word.requiresFullPlayback||time<word.startSeconds||time>=word.endSeconds)continue;
            if(alignment.conservativeGroups?.some(group=>wordIndex>=group.firstWordIndex&&wordIndex<=group.lastWordIndex))return null;
            const mapped=recognized.previewMap[wordIndex];if(!mapped)return null;
            const start=source.chunkOffsets[index]+mapped.startChar,end=source.chunkOffsets[index]+mapped.endChar;
            return {startChar:source.normToRaw[start],endChar:source.normToRaw[end-1]+1};
        }
        return null;
    }
    function hasFullPlayback(audio) {return !!audio?.ended && Number.isFinite(audio.duration) && audio.duration>0 && playedThrough(audio)>=audio.duration-.001;}
    // Private preparation only: this does not publish any delivered words. Use
    // recognized audio, including conservative ASR endpoints, never draft text.
    function predictTimedTranscript(chunks, plan) {
        if (!Array.isArray(chunks) || !chunks.length || !plan) return null;
        const {playbackRate, timerBudgetSeconds, timerLeadSeconds, playbackReserveSeconds} = plan;
        if (![playbackRate,timerBudgetSeconds,timerLeadSeconds,playbackReserveSeconds].every(Number.isFinite)
            || playbackRate<=0 || timerBudgetSeconds<=0 || timerLeadSeconds<0 || playbackReserveSeconds<0) return null;
        if (chunks.some(chunk=>!chunk || !Number.isFinite(chunk.durationSeconds) || chunk.durationSeconds<=0
            || typeof chunk.transcript?.transcriptText!=="string" || !chunk.transcript.transcriptText.trim())) return null;
        const parts=chunks.map(chunk=>chunk.transcript.transcriptText.trim());
        const fullText=parts.join(" ");
        const cutoffPrediction=prefix=>{
            if(!prefix) return null;
            // A slight overestimate is intentional. Keep at most two additional
            // recognized words, with no rewrite or cutoff-dependent retry.
            const suffix=fullText.slice(prefix.length);
            const next=Array.from(suffix.matchAll(/\S+/gu)).slice(0,2);
            const end=next.length?prefix.length+next.at(-1).index+next.at(-1)[0].length:prefix.length;
            return Object.freeze({text:fullText.slice(0,end),deliveryState:"cutoff"});
        };
        const completed=[];
        let available=Math.max(0,timerBudgetSeconds-timerLeadSeconds-playbackReserveSeconds)*playbackRate;
        try {
            for(let index=0;index<chunks.length;index++) {
                const chunk=chunks[index];
                const recognized={text:parts[index],alignment:chunk.transcript.alignment};
                if(recognized.alignment && (recognized.alignment.text!==recognized.text || !Array.isArray(recognized.alignment.words))) return null;
                if(available+1e-7>=chunk.durationSeconds) {
                    completed.push(recognized.text);
                    available=Math.max(0,available-chunk.durationSeconds);
                    continue;
                }
                if (available<=1e-7) return cutoffPrediction(completed.join(" "));
                const progress=recognizedProgress(recognized,completed.join(" "),available);
                if(!progress) return null;
                return cutoffPrediction(progress.text);
            }
            return Object.freeze({text:fullText,deliveryState:"complete"});
        } catch { return null; }
    }
    return Object.freeze({attach,has,previewText,displayText,isPreviewOnly,endPreview,matchesSource,wordCount,registerSpokenTranscript,completeChunk,beginSpokenCutoff,finalizeSpokenCutoff,sealUnresolved,playedThrough,captureProgress,highlightRange,previewHighlightRange,hasFullPlayback,predictTimedTranscript});
});
