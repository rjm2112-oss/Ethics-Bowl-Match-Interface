"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const scoring=require("../src/shared/final-scoring"),tally=require("../src/shared/scorecard-tally"),rubric=require("../src/shared/ethics-bowl-rubric"),context=require("../src/shared/transcript-context");
const full={presentationQuestion:5,presentationEthics:5,presentationViewpoints:5,responseToFeedback:10,judgesQuestions:20,commentary:10,respectfulDialogue:5};
test("strict scorecard schema requires fourteen integer scores and two team-level comments per participant",()=>{
 const schema=scoring.schema.schema;assert.deepEqual(schema.required,["participantOne","participantTwo"]);assert.equal(schema.additionalProperties,false);
 for(const name of ["participantOne","participantTwo"]){const value=schema.properties[name];assert.deepEqual(value.required,[...Object.keys(full),"didWell","needsImprovement"]);assert.equal(value.additionalProperties,false);for(const [key,[min,max]]of Object.entries(tally.OFFICIAL_BREAKDOWN_RANGES))assert.deepEqual(value.properties[key],{type:"integer",minimum:min,maximum:max});}
});
test("score normalization rejects nonnumeric, missing, extra and old-comment formats; totals are calculated",()=>{
 const raw={participantOne:{...full,didWell:"One strengths.",needsImprovement:"One improvement."},participantTwo:{...full,commentary:9,didWell:"Two strengths.",needsImprovement:"Two improvement."}},card=scoring.normalize(raw,2);
 assert.equal(card.humanScore,60);assert.equal(card.aiScore,59);assert.equal(card.comment,undefined);assert.equal(card.humanComments.didWell,raw.participantOne.didWell);assert.equal(card.aiComments.needsImprovement,raw.participantTwo.needsImprovement);assert.equal(card.humanComment,undefined);
 for(const altered of [{...raw,comment:"Old overall comment"},{...raw,participantOne:{...raw.participantOne,didWell:""}},{...raw,participantOne:{...raw.participantOne,commentary:"10"}},{...raw,participantOne:{...raw.participantOne,commentary:11}},{...raw,participantTwo:{...raw.participantTwo,extra:0}}])assert.throws(()=>scoring.normalize(altered,1));
 assert.deepEqual(tally.computeVoteTally([card,card,card]).humanVotes,3);
});
test("final scoring retains every official band and the delivered context in both languages",()=>{
 for(const locale of ["en","fr-ca"]){
 const messages=[{kind:"ai",label:"Alex",caseNum:1,phaseId:"p",text:"Delivered reasoning.",speechDeliveryState:"complete"},{kind:"ai",label:"Morgan",caseNum:2,phaseId:"a",text:"Heard prefix.",speechDeliveryState:"cutoff"}];
 const transcript=context.scoring({messages,phases:[{id:"p",kind:"speech",subtype:"presentation"},{id:"a",kind:"judgeAnswer",judgeNumber:1}],cases:{1:{title:"One",question:"Question one?",text:"FULL_CASE_ONE"},2:{title:"Two",question:"Question two?",text:"FULL_CASE_TWO"}},leadByCase:{1:"human",2:"ai"},names:{human:"Alex",ai:"Morgan"},locale});
 const prompt=scoring.userPrompt({transcript,names:{human:"Alex",ai:"Morgan"},leadByCase:{1:"human",2:"ai"},locale});
 for(const value of Object.values(rubric.CRITERIA))assert.ok(prompt.includes(rubric.formatCriterion(value)));
 for(const text of ["FULL_CASE_ONE","FULL_CASE_TWO","Question one?","Question two?","Delivered reasoning.","Heard prefix.","two team-level written comments"])assert.ok(prompt.includes(text));
 assert.doesNotMatch(prompt,/thresholdAudit|55\/60|calibration|humanComment|aiComment|one overall written comment/);
 }
});
