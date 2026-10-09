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
    return Object.freeze({alignRecognized});
});
