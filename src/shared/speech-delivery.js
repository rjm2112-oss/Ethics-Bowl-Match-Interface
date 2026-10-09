(function expose(root, factory) {
    const value = factory();
    if (typeof module === "object" && module.exports) module.exports = value;
    if (root) root.EthicsSpeechDelivery = value;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";
    const sources=new WeakMap();
    const normalize=text=>String(text||"").replace(/\s+/g," ").trim();
    function attach(message,originalText,chunks) {
        if(!message || sources.has(message))throw Error("Speech delivery is already attached or invalid.");
        const parts=chunks.map(normalize),normalized=normalize(originalText);
        if(!parts.length || parts.some(part=>!part) || parts.join(" ")!==normalized)throw Error("Speech chunks do not exactly cover the original text.");
        sources.set(message,{normalized,preview:String(originalText||""),wordCount:normalized.split(" ").length,parts,recognized:[],completed:[],next:0,closed:false});
        message.text="";message.speechDeliveryState="pending";
    }
    function has(message){return sources.has(message);}
    // Display-only generated preview. It never enters message.text or model context.
    function previewText(message){const source=sources.get(message);return source && !source.closed && message.speechDeliveryState==="pending" ? source.preview : null;}
    function matchesSource(message,text){return sources.get(message)?.normalized===normalize(text);}
    function wordCount(message){return sources.get(message)?.wordCount??0;}
    function registerSpokenTranscript(message,index,transcript) {
        const source=sources.get(message);
        if(!source || source.closed || !Number.isInteger(index) || index<source.next || index>=source.parts.length || typeof transcript?.transcriptText!=="string" || !transcript.transcriptText.trim())throw Error("The played audio needs a valid speech transcript.");
        const text=transcript.transcriptText.trim(),alignment=transcript.alignment||null;
        if(alignment && (alignment.text!==text || !Array.isArray(alignment.words)))throw Error("Word timestamps must describe the recognized speech.");
        source.recognized[index]={text,alignment};
    }
    function completeChunk(message,index) {
        const source=sources.get(message);
        if(!source || source.closed || message.speechDeliveryState!=="pending" || index!==source.next)return false;
        const recognized=source.recognized[index];if(!recognized)throw Error("The played audio needs a speech transcript.");
        source.completed.push(recognized.text);source.next++;message.text=source.completed.join(" ");
        if(source.next===source.parts.length){message.speechDeliveryState="complete";source.closed=true;source.normalized="";source.preview="";source.parts=[];}
        return true;
    }
    function beginSpokenCutoff(message) {
        const source=sources.get(message);if(!source || source.closed || message.speechDeliveryState!=="pending")return false;
        source.closed=true;source.preview="";message.text=source.completed.join(" ");message.speechDeliveryState="transcribing";return true;
    }
    function finalizeSpokenCutoff(message,actualPartialText) {
        const source=sources.get(message);
        if(!source || !["transcribing","unresolved"].includes(message.speechDeliveryState) || typeof actualPartialText!=="string")return false;
        message.text=[...source.completed,actualPartialText.trim()].filter(Boolean).join(" ");message.speechDeliveryState="cutoff";source.normalized="";source.parts=[];source.recognized=[];return true;
    }
    function sealUnresolved(message) {
        const source=sources.get(message);
        if(!source || !["pending","transcribing"].includes(message.speechDeliveryState))return false;
        source.closed=true;source.preview="";message.text=source.completed.join(" ");message.speechDeliveryState="unresolved";return true;
    }
    function playedThrough(audio) {
        let covered=0;
        for(let i=0;i<(audio?.played?.length||0);i++){
            if(audio.played.start(i)>covered+.001)break;
            covered=Math.max(covered,audio.played.end(i));
        }
        return covered;
    }
    // Read only a verified recognized chunk and media intervals actually played.
    // Timestamp endpoints are ASR estimates, so only completed words are released.
    function confirmedProgress(message,index,audio) {
        const source=sources.get(message),recognized=source?.recognized[index],alignment=recognized?.alignment;
        if(!source || source.closed || message.speechDeliveryState!=="pending" || index!==source.next
            || !alignment || alignment.text!==recognized.text || !Array.isArray(alignment.words)
            || !Number.isFinite(audio?.currentTime) || audio.currentTime<0)return null;
        const through=Math.min(audio.currentTime,playedThrough(audio));
        if(!Number.isFinite(through) || through<0)return null;
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
        const completed=source.completed.join(" "),prefix=recognized.text.slice(0,last?.endChar||0);
        return {text:[completed,prefix].filter(Boolean).join(" "),last,offset:completed.length+(completed && prefix?1:0)};
    }
    function captureProgress(message,index,audio) {
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
    function hasFullPlayback(audio) {return !!audio?.ended && Number.isFinite(audio.duration) && audio.duration>0 && playedThrough(audio)>=audio.duration-.001;}
    return Object.freeze({attach,has,previewText,matchesSource,wordCount,registerSpokenTranscript,completeChunk,beginSpokenCutoff,finalizeSpokenCutoff,sealUnresolved,playedThrough,captureProgress,highlightRange,hasFullPlayback});
});
