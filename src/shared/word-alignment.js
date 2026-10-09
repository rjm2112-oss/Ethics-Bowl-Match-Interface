(function expose(root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    if (root) root.EthicsWordAlignment = api;
})(typeof globalThis === "object" ? globalThis : this, function createAlignment() {
    "use strict";
    const clean = text => String(text).normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const enSmall="zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
    const enTens="zero ten twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
    const frSmall="zéro un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize".split(" ");
    function english(n) {
        if(n<20)return enSmall[n];
        if(n<100)return enTens[Math.floor(n/10)]+(n%10?" "+english(n%10):"");
        if(n<1000)return english(Math.floor(n/100))+" hundred"+(n%100?" "+english(n%100):"");
        return english(Math.floor(n/1000))+" thousand"+(n%1000?" "+english(n%1000):"");
    }
    function french(n) {
        if(n<=16)return frSmall[n];
        if(n<20)return "dix "+frSmall[n-10];
        if(n<70){const tens=["","","vingt","trente","quarante","cinquante","soixante"][Math.floor(n/10)];return tens+(n%10===1?" et un":n%10?" "+french(n%10):"");}
        if(n<80)return "soixante "+(n===71?"et ":"")+french(n-60);
        if(n<100)return "quatre vingt"+(n===80?"s":" "+french(n-80));
        if(n<1000)return (n<200?"":french(Math.floor(n/100))+" ")+"cent"+(n%100?" "+french(n%100):n>=200?"s":"");
        return (n<2000?"":french(Math.floor(n/1000))+" ")+"mille"+(n%1000?" "+french(n%1000):"");
    }
    const contractions={"can't":["cannot","can not"],"won't":["will not"],"don't":["do not"],"doesn't":["does not"],"didn't":["did not"],"isn't":["is not"],"aren't":["are not"],"it's":["it is"],"we're":["we are"],"i'm":["i am"],"that's":["that is"],"shouldn't":["should not"],"couldn't":["could not"],"wouldn't":["would not"]};
    function forms(raw,locale) {
        const base=raw.replace(/^[^\p{L}\p{N}$€£]+|[^\p{L}\p{N}%]+$/gu,"");
        const decimal=/^\d+[.,]\d+$/.test(base);
        const alternatives=decimal ? [] : [base];
        const lower=base.toLowerCase().replace(/’/g,"'");
        if(contractions[lower])alternatives.push(...contractions[lower]);
        // Known numeric renderings only; unsupported spoken forms fail closed.
        const match=base.match(/^([$€£]?)(\d{1,4})(?:([.,])(\d{1,4}))?(%)?$/);
        if(match){
            const [,currency,integer,separator,fraction,percent]=match,n=Number(integer),fr=/^fr/.test(locale);
            const name=fr?french(n):english(n);
            const decimal=fraction?(fr?" virgule ":" point ")+fraction.split("").map(d=>fr?frSmall[Number(d)]:enSmall[Number(d)]).join(" "):"";
            const spoken=name+decimal;
            if(currency || percent)alternatives.length=0;
            else alternatives.push(spoken,spoken.replace(/ hundred /g," hundred and "));
            if(!currency && !percent && !fraction && !fr && n>=1000 && n<2100 && n%100>=10)alternatives.push(english(Math.floor(n/100))+" "+english(n%100));
            if(currency)alternatives.push(spoken+" "+({"$":fr?"dollars":"dollars","€":fr?"euros":"euros","£":fr?"livres":"pounds"}[currency]));
            if(percent)alternatives.push(spoken+(fr?" pour cent":" percent"));
            // Keep decimal punctuation meaningful when ASR returns digits.
            if(!currency && !percent)alternatives.push(integer+(fraction?"decimal"+fraction:""));
        }
        return new Set(alternatives.map(clean).filter(Boolean));
    }
    function recognizedKey(raw) {
        const decimal=String(raw).trim().match(/^(\d+)[.,](\d+)$/);
        return decimal?decimal[1]+"decimal"+decimal[2]:clean(raw);
    }
    function alignRecognized(text, words, durationSeconds, locale="en") {
        if(!Array.isArray(words)||!words.length||!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new Error("Word timestamps are missing.");
        let previousStart=0,previousEnd=0;
        for(const item of words){
            if(typeof item?.word!=="string"||!recognizedKey(item.word)||!Number.isFinite(item.start)||!Number.isFinite(item.end)||item.start<0||item.end<item.start||item.start<previousStart||item.end<previousEnd||item.end>durationSeconds+.05)throw new Error("Word timestamps are invalid or non-monotone.");
            previousStart=item.start;previousEnd=item.end;
        }
        // A zero-duration ASR word has no trustworthy individual endpoint.
        // Defer the whole uncertain run through the next positive-duration
        // recognized word. Its real returned end is a conservative completion
        // bound; never interpolate or expose uncertain words earlier.
        const completionEnds=words.map(item=>item.end), completionRequiresFullPlayback=words.map(()=>false), conservativeGroups=[];
        for(let index=0;index<words.length;index++){
            if(words[index].end!==words[index].start)continue;
            const first=index;
            while(index<words.length && words[index].end===words[index].start)index++;
            if(index===words.length){
                // A trailing uncertain run has no word anchor. Keep its raw
                // endpoints, but forbid partial-playback release entirely.
                // Only verified full chunk playback can confirm these words.
                for(let uncertain=first;uncertain<index;uncertain++)completionRequiresFullPlayback[uncertain]=true;
                conservativeGroups.push({firstWordIndex:first,lastWordIndex:index-1,startSeconds:words[first].start,endSeconds:null,requiresFullPlayback:true});
                break;
            }
            const anchor=words[index];
            for(let uncertain=first;uncertain<index;uncertain++)completionEnds[uncertain]=anchor.end;
            conservativeGroups.push({firstWordIndex:first,lastWordIndex:index,startSeconds:words[first].start,endSeconds:anchor.end});
        }
        const tokens=Array.from(String(text).matchAll(/\S+/gu)).filter(token=>clean(token[0]));
        const result=[];let cursor=0;
        for(const token of tokens){
            const candidates=forms(token[0],locale);let matched=0;
            // Split recognition is allowed only for original apostrophe/hyphen,
            // explicit contractions and known numeric spoken forms.
            const expandable=/['’\-–—\d]/u.test(token[0]) || clean(token[0])==="humanlike";
            let key="";
            for(let count=1;count<=Math.min(expandable?16:1,words.length-cursor);count++){
                key+=recognizedKey(words[cursor+count-1].word);
                if(candidates.has(key)){matched=count;break;}
            }
            if(!matched)throw new Error(`Speech word alignment does not match original token ${result.length+1}.`);
            result.push({startChar:token.index,endChar:token.index+token[0].length,startSeconds:words[cursor].start,endSeconds:completionEnds[cursor+matched-1],
                ...(completionRequiresFullPlayback.slice(cursor,cursor+matched).some(Boolean)?{requiresFullPlayback:true}:{})});
            cursor+=matched;
        }
        if(cursor!==words.length||!result.length)throw new Error("Speech recognition contains unmatched words.");
        return {method:"whisper-1-estimated-word-timestamps",text:String(text),durationSeconds,words:result,conservativeGroups};
    }
    // Display-only recovery from returned ASR anchors. Invalid or uncertain
    // intervals are omitted, never interpolated or used for delivered text.
    function alignPreviewRecognized(words, durationSeconds) {
        if(!Array.isArray(words)||!Number.isFinite(durationSeconds)||durationSeconds<=0)return null;
        const retained=[];let text="",previousStart=0,previousEnd=0;
        for(const item of words){
            if(typeof item?.word!=="string"||!recognizedKey(item.word)||!Number.isFinite(item.start)||!Number.isFinite(item.end)
                ||item.start<0||item.end<=item.start||item.start<previousStart||item.end<previousEnd||item.end>durationSeconds+.05)continue;
            const token=item.word.trim();if(!token)continue;
            if(text)text+=" ";const startChar=text.length;text+=token;
            retained.push({startChar,endChar:text.length,startSeconds:item.start,endSeconds:item.end});
            previousStart=item.start;previousEnd=item.end;
        }
        return retained.length?{method:"validated-asr-preview-anchors",text,durationSeconds,words:retained}:null;
    }
    // Display-only mapping. Insertions/substitutions stay unmapped and ambiguous
    // repeated words are skipped; this never changes recognized delivery text.
    function mapPreviewWords(preview, alignment, locale="en") {
        if(typeof alignment?.text!=="string" || !Array.isArray(alignment.words))return [];
        const spoken=alignment.words;
        let previousChar=0,previousStart=0,previousEnd=0;
        for(const word of spoken){
            if(!Number.isInteger(word.startChar)||!Number.isInteger(word.endChar)||word.startChar<previousChar
                ||word.endChar<=word.startChar||word.endChar>alignment.text.length
                ||!Number.isFinite(word.startSeconds)||!Number.isFinite(word.endSeconds)
                ||word.startSeconds<previousStart||word.endSeconds<previousEnd||word.endSeconds<word.startSeconds)return [];
            previousChar=word.endChar;previousStart=word.startSeconds;previousEnd=word.endSeconds;
        }
        return mapTextRanges(preview,alignment.text,spoken,locale);
    }
    // Text layout has no timestamps and never authorizes speech delivery.
    function restoreParagraphs(preview,text,locale="en") {
        if(!String(preview).includes("\n") || !text)return text;
        const tokens=value=>Array.from(value.matchAll(/\S+/gu)).filter(token=>clean(token[0]));
        const original=tokens(preview),words=tokens(text),keys=words.map(token=>clean(token[0])),breaks=[];
        const uniqueAnchor=(from,to,offset)=>{
            const anchor=original.slice(from,to).map(token=>clean(token[0]));
            if(anchor.length<2)return -1;
            let found=-1;
            for(let index=0;index<=keys.length-anchor.length;index++){
                if(!anchor.every((key,n)=>key===keys[index+n]))continue;
                if(found>=0)return -1;
                found=index+offset;
            }
            return found;
        };
        // A handful of unambiguous words around each paragraph is enough for
        // layout. Avoid a full edit-distance matrix on the audio-end UI frame.
        let previousWord=0;
        for(let index=1;index<original.length;index++){
            const prior=original[index-1];
            if(!/\n/.test(preview.slice(prior.index+prior[0].length,original[index].index)))continue;
            const before=Math.max(0,index-3),after=Math.min(original.length,index+3);
            let at=uniqueAnchor(before,after,index-before);
            for(let count=6;at<0&&count>=2;count--)at=uniqueAnchor(index,Math.min(original.length,index+count),0);
            for(let count=6;at<0&&count>=2;count--){const start=Math.max(0,index-count);at=uniqueAnchor(start,index,index-start);}
            if(at>previousWord && at<words.length){breaks.push(words[at].index);previousWord=at;}
        }
        let result="",start=0;
        for(const end of breaks){result+=text.slice(start,end).trimEnd()+"\n\n";start=end;}
        return result+text.slice(start);
    }
    function mapTextRanges(preview,text,spoken,locale) {
        const original=Array.from(String(preview).matchAll(/\S+/gu)).filter(token=>clean(token[0]));
        const alignment={text};
        const keys=spoken.map(word=>recognizedKey(alignment.text.slice(word.startChar,word.endChar)));
        const originalForms=original.map(token=>forms(token[0],locale));
        const spokenForms=spoken.map(word=>forms(alignment.text.slice(word.startChar,word.endChar),locale));
        const expandable=raw=>/['’\-–—\d]/u.test(raw)||clean(raw)==="humanlike";
        const matches=(i,j)=>{
            const found=[];let key="";
            for(let count=1;count<=Math.min(expandable(original[i][0])?16:1,spoken.length-j);count++){
                key+=keys[j+count-1];
                if(originalForms[i].has(key))found.push({originalCount:1,spokenCount:count});
            }
            if(expandable(alignment.text.slice(spoken[j].startChar,spoken[j].endChar))){
                key=clean(original[i][0]);
                for(let count=2;count<=Math.min(16,original.length-i);count++){
                    key+=clean(original[i+count-1][0]);
                    if(spokenForms[j].has(key))found.push({originalCount:count,spokenCount:1});
                }
            }
            return found;
        };
        const rows=original.length+1,cols=spoken.length+1,size=rows*cols;
        if(!original.length||!spoken.length||size>4000000)return [];
        // Most TTS/ASR pairs differ only in typography or contractions. Exact
        // monotone coverage avoids the edit-distance work on this common path.
        const exact=[];let originalCursor=0,spokenCursor=0;
        while(originalCursor<original.length && spokenCursor<spoken.length){
            const choices=matches(originalCursor,spokenCursor);
            if(choices.length!==1)break;
            const match=choices[0],last=original[originalCursor+match.originalCount-1];
            const range={startChar:original[originalCursor].index,endChar:last.index+last[0].length};
            for(let n=0;n<match.spokenCount;n++)exact.push(range);
            originalCursor+=match.originalCount;spokenCursor+=match.spokenCount;
        }
        if(originalCursor===original.length && spokenCursor===spoken.length)return exact;
        const forward=new Uint32Array(size).fill(0xFFFFFFFF),backward=new Uint32Array(size).fill(0xFFFFFFFF);
        const at=(i,j)=>i*cols+j;
        forward[0]=0;
        for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
            const cost=forward[at(i,j)];
            if(i<original.length)forward[at(i+1,j)]=Math.min(forward[at(i+1,j)],cost+1);
            if(j<spoken.length)forward[at(i,j+1)]=Math.min(forward[at(i,j+1)],cost+1);
            if(i<original.length&&j<spoken.length)for(const match of matches(i,j)){
                const next=at(i+match.originalCount,j+match.spokenCount);
                forward[next]=Math.min(forward[next],cost);
            }
        }
        backward[size-1]=0;
        for(let i=rows-1;i>=0;i--)for(let j=cols-1;j>=0;j--){
            if(i<original.length)backward[at(i,j)]=Math.min(backward[at(i,j)],1+backward[at(i+1,j)]);
            if(j<spoken.length)backward[at(i,j)]=Math.min(backward[at(i,j)],1+backward[at(i,j+1)]);
            if(i<original.length&&j<spoken.length)for(const match of matches(i,j)){
                backward[at(i,j)]=Math.min(backward[at(i,j)],backward[at(i+match.originalCount,j+match.spokenCount)]);
            }
        }
        const best=forward[size-1],candidates=spoken.map(()=>new Map());
        for(let i=0;i<rows;i++)for(let j=0;j<spoken.length;j++){
            const cost=forward[at(i,j)];
            if(cost+1+backward[at(i,j+1)]===best)candidates[j].set("unmatched",null);
            if(i===original.length)continue;
            for(const match of matches(i,j)){
                if(cost+backward[at(i+match.originalCount,j+match.spokenCount)]!==best)continue;
                const startChar=original[i].index,last=original[i+match.originalCount-1];
                const range={startChar,endChar:last.index+last[0].length};
                for(let n=j;n<j+match.spokenCount;n++)candidates[n].set(`${range.startChar}:${range.endChar}`,range);
            }
        }
        return candidates.map(candidate=>candidate.size===1?[...candidate.values()][0]:null);
    }
    return Object.freeze({alignRecognized,alignPreviewRecognized,mapPreviewWords,restoreParagraphs});
});
