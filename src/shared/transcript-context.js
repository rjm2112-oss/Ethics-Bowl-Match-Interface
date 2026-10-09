(function expose(root, factory) {
    const value = factory(typeof module === "object" && module.exports ? require("./case-packet") : root.EthicsCasePacket);
    if (typeof module === "object" && module.exports) module.exports = value;
    if (root) root.EthicsTranscriptContext = value;
})(typeof globalThis === "object" ? globalThis : this, function (packetParser) {
    "use strict";
    const FINAL_STATES = new Set(["complete","cutoff"]);
    function isReady(messages) { return messages.every(message=>FINAL_STATES.has(message.speechDeliveryState)); }
    function assertReady(messages,locale="en") {
        if(!isReady(messages))throw Error(locale==="fr-ca"?"Le contexte du modèle attend une transcription vérifiée de la parole livrée.":"Model context is waiting for a verified delivered transcript.");
    }
    function isSubstantive(message) {return !!message && message.substantive!==false && ["human","ai","ai-alt","judge"].includes(message.kind);}
    function discussion({messages,phases,locale="en",caseNum=null}) {
        assertReady(messages,locale);
        const french=locale==="fr-ca", caseLabel=n=>french?`Cas ${n}`:`Case #${n}`;
        const phaseMap=new Map(phases.map(phase=>[phase.id,phase]));
        return messages.filter(message=>(caseNum===null || message.caseNum===caseNum)&&isSubstantive(message)).map(message=>{
            const phase=phaseMap.get(message.phaseId),header=[];
            let section=french?"Tour":"Turn";
            if(phase?.kind==="speech") section=(french?{presentation:"Présentation",commentary:"Commentaire",response:"Réplique"}:{presentation:"Presentation",commentary:"Commentary",response:"Response"})[phase.subtype];
            else if(phase?.kind==="judgeQuestion")section=french?`Question du Juge ${phase.judgeNumber}`:`Judge ${phase.judgeNumber} Question`;
            else if(phase?.kind==="judgeAnswer")section=french?`Réponse au Juge ${phase.judgeNumber}`:`Judge ${phase.judgeNumber} Answer`;
            else if(message.kind==="judge")section=french?"Question du juge":"Judge Question";
            if(message.caseNum)header.push(caseLabel(message.caseNum));header.push(section,message.label);
            if(message.speechDeliveryState==="cutoff")header.push(french?"Arrêt à la limite de temps":"Stopped at time limit");
            return `[${header.join(" • ")}] ${message.text}`;
        }).join("\n\n");
    }
    function scoring({messages,phases,cases,leadByCase,names,locale="en"}) {
        assertReady(messages,locale);
        const french=locale==="fr-ca";
        return [1,2].map(caseNum=>{
            const data=cases[caseNum],leader=leadByCase[caseNum],responder=leader==="human"?"ai":"human";
            return [
                `${french?`CAS ${caseNum}`:`CASE #${caseNum}`}: ${data.title}`,
                `${french?"Cas complet":"Full case"}: ${packetParser.parse(data.text).narrative}`,
                `${french?"Question du modérateur":"Moderator question"}: ${data.question}`,
                `${french?"Présentatrice":"Leader"}: ${names[leader]}`,
                `${french?"Répondante":"Responder"}: ${names[responder]}`,
                discussion({messages,phases,locale,caseNum})||"[No substantive transcript recorded for this case.]"
            ].join("\n");
        }).join("\n\n");
    }
    return Object.freeze({isReady,assertReady,isSubstantive,discussion,scoring});
});
