(function(root,factory){const api=factory(typeof module==="object"&&module.exports?require("./scorecard-tally"):root.EthicsScorecardTally,typeof module==="object"&&module.exports?require("./ethics-bowl-rubric"):root.EthicsBowlRubric);if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.EthicsFinalScoring=api;})(typeof globalThis==="object"?globalThis:this,function(tally,rubric){"use strict";
    const keys=Object.freeze(Object.keys(tally.OFFICIAL_BREAKDOWN_RANGES));
    const participantSchema=()=>({type:"object",additionalProperties:false,required:[...keys,"didWell","needsImprovement"],properties:{...Object.fromEntries(keys.map(key=>[key,{type:"integer",minimum:tally.OFFICIAL_BREAKDOWN_RANGES[key][0],maximum:tally.OFFICIAL_BREAKDOWN_RANGES[key][1]}])),didWell:{type:"string"},needsImprovement:{type:"string"}}});
    const schema=Object.freeze({name:"final_judge_scorecard",strict:true,schema:{type:"object",additionalProperties:false,required:["participantOne","participantTwo"],properties:{participantOne:participantSchema(),participantTwo:participantSchema()}}});
    function normalize(raw,judgeNumber,locale="en") {
        const french=locale==="fr-ca";
        if(!raw || typeof raw!=="object" || Array.isArray(raw) || Object.keys(raw).length!==2 || !["participantOne","participantTwo"].every(key=>Object.hasOwn(raw,key)))throw Error(french?"Le juge IA a renvoyé un format de fiche invalide.":"AI judge returned an invalid scorecard format.");
        const parseTeam = team => {
            if(!team || typeof team!=="object" || Array.isArray(team) || Object.keys(team).length!==keys.length+2
                || ![...keys,"didWell","needsImprovement"].every(key=>Object.hasOwn(team,key)))throw Error(french?"La fiche doit inclure sept notes et deux commentaires pour chaque participant.":"The scorecard must include seven scores and two comments for each participant.");
            const breakdown=tally.normalizeOfficialParticipantBreakdown(Object.fromEntries(keys.map(key=>[key,team[key]])));
            if(!breakdown)throw Error(french?"Le juge IA a renvoyé des notes numériques de critères manquantes ou invalides.":"AI judge returned missing or invalid numeric criterion scores.");
            const clean = value => typeof value==="string"?value.replace(/\r\n?/g,"\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").trim():"";
            const comments=Object.freeze({didWell:clean(team.didWell),needsImprovement:clean(team.needsImprovement)});
            if(!comments.didWell || !comments.needsImprovement)throw Error(french?"Chaque participant doit recevoir les deux commentaires écrits.":"Each participant must receive both written comments.");
            return {breakdown,comments};
        };
        const one=parseTeam(raw.participantOne),two=parseTeam(raw.participantTwo);
        return Object.freeze({judgeNumber,name:french?`Juge ${judgeNumber}`:`Judge ${judgeNumber}`,humanScore:tally.totalOfficialParticipantBreakdown(one.breakdown),aiScore:tally.totalOfficialParticipantBreakdown(two.breakdown),humanComments:one.comments,aiComments:two.comments,humanBreakdown:one.breakdown,aiBreakdown:two.breakdown});
    }
    function systemPrompt(locale="en") {
        return ["You are a judge scoring a completed live Ethics Bowl match independently.",locale==="fr-ca"?"All user-facing output must be in natural Québec French. Moderator text, judge questions, participant speeches, and scorecard comments must all be in Québec French. Do not switch to English unless directly quoting source text that is itself English.":"","Apply the supplied official rubric to the delivered match transcript. Return the seven numeric criterion scores for each participant and two team-level written comments for each participant: What the team did well and What needs improvement. Do not provide per-criterion explanations."].join("\n\n");
    }
    function userPrompt({transcript,names,leadByCase,locale="en"}) {
        const one=leadByCase[1]==="human"?1:2,two=leadByCase[1]==="ai"?1:2;
        return [
            `This is a completed live Ethics Bowl match between Participant 1, "${names.human}", and Participant 2, "${names.ai}".`,
            rubric.buildFullCriteria({locale}),
            `Participant 1 presented Case #${one}; Participant 2 presented Case #${two}. For each participant, score presentation, response and the entire judges' questioning period on their presented case; score commentary on the other case and respectful dialogue once across the full match.`,
            "Score each criterion using the delivered transcript. Return only the supplied strict scorecard format: seven integer criterion scores per participant and two team-level written comments for each participant: didWell (What the team did well) and needsImprovement (What needs improvement). Do not provide per-criterion explanations or an overall judge comment. The app calculates totals and votes from those scores.",
            `Both full cases, moderator questions, presenter identities, and delivered full-match transcript:\n${transcript}`
        ].join("\n\n");
    }
    return Object.freeze({schema,normalize,systemPrompt,userPrompt});
});
