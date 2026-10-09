"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const packets=require("../src/shared/case-packet"),prompts=require("../src/shared/ai-turn-prompt");
for(const [locale,heading] of [["en","Discussion Questions"],["fr-ca","Matière à discussion"]]) {
 test(`${locale} keeps raw packet privately and excludes unused discussion questions from every participant/judge prompt`,()=>{
  const raw=`A narrative asks: Discussion questions?\nThis sentence belongs to the narrative.\n${heading}\n1. SELECTED_QUESTION?\n2. UNUSED_QUESTION?\nFurther Reading\nPRIVATE_REFERENCE`;
  const packet=packets.parse(raw);assert.equal(packet.rawPacket,raw);assert.match(packet.narrative,/Discussion questions\?/);assert.doesNotMatch(packet.narrative,/UNUSED_QUESTION|PRIVATE_REFERENCE/);assert.deepEqual(packet.discussionQuestions,["SELECTED_QUESTION?","UNUSED_QUESTION?"]);
  const caseData={title:"Case",text:raw,question:packet.discussionQuestions[0]},base={locale,caseData,participantNames:["One","Two"],questionedParticipant:"One",judgeNumber:1,judgeQuestion:"Why?"};
  for(const result of [prompts.buildAiTurnPrompt({...base,phase:{kind:"speech",subtype:"presentation",duration:300}}),prompts.buildJudgeQuestionPrompt(base),prompts.buildJudgeAnswerPrompt(base)]){assert.match(result,/SELECTED_QUESTION/);assert.doesNotMatch(result,/UNUSED_QUESTION|PRIVATE_REFERENCE/);}
 });
}
