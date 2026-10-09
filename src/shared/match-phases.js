(function expose(root, factory) {
    const value = factory();
    if (typeof module === "object" && module.exports) module.exports = value;
    if (root) root.EthicsMatchPhases = value;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";
    const TIMINGS = Object.freeze({ presentationConfer:120, presentationSpeak:300, commentaryConfer:60, commentarySpeak:180, responseConfer:60, responseSpeak:180, judgePeriodTotal:600, judgeAsk:60, judgeAnswer:140 });
    function build({leadByCase, locale="en"}) {
        const french=locale==="fr-ca", phases=[];
        const labels=french?{presentation:"Présentation",commentary:"Commentaire",response:"Réplique"}:{presentation:"Presentation",commentary:"Commentary",response:"Response"};
        const caucus={presentation:"Caucus de présentation",commentary:"Caucus de commentaire",response:"Caucus de réplique"};
        for(const caseNum of [1,2]) {
            const leader=leadByCase[caseNum];
            if(!["human","ai"].includes(leader))throw Error("A case presenter is required.");
            const responder=leader==="human"?"ai":"human", label=french?`Cas ${caseNum}`:`Case #${caseNum}`;
            phases.push({id:`case${caseNum}-moderator`,kind:"moderatorCase",caseNum,title:french?`Phase du modérateur — ${label}`:`Moderator's Phase #${caseNum}`,duration:null});
            for(const subtype of ["presentation","commentary","response"]) {
                const speaker=subtype==="commentary"?responder:leader;
                phases.push({id:`case${caseNum}-${subtype}-confer`,kind:"confer",caseNum,title:`${label}: ${french?caucus[subtype]:`${labels[subtype]} Confer`}`,subtype,speaker,duration:TIMINGS[subtype+"Confer"]});
                phases.push({id:`case${caseNum}-${subtype}`,kind:"speech",caseNum,title:`${label}: ${labels[subtype]}`,subtype,speaker,duration:TIMINGS[subtype+"Speak"]});
            }
            for(let judgeNumber=1;judgeNumber<=3;judgeNumber++) {
                phases.push({id:`case${caseNum}-judge${judgeNumber}-question`,kind:"judgeQuestion",caseNum,title:french?`${label} : question du Juge ${judgeNumber}`:`${label}: Judge ${judgeNumber} Question`,judgeNumber,answerer:leader,duration:TIMINGS.judgeAsk});
                phases.push({id:`case${caseNum}-judge${judgeNumber}-answer`,kind:"judgeAnswer",caseNum,title:french?`${label} : réponse au Juge ${judgeNumber}`:`${label}: Judge ${judgeNumber} Answer`,judgeNumber,speaker:leader,duration:TIMINGS.judgeAnswer});
            }
            phases.push({id:`case${caseNum}-scoring`,kind:"scoring",caseNum,title:french?`${label} : pointage des juges`:`${label}: Judges Scoring`,duration:null});
        }
        phases.push({id:"closing",kind:"closing",title:french?"Clôture":"Closing Phase",duration:null});
        return phases;
    }
    return Object.freeze({TIMINGS,build});
});
