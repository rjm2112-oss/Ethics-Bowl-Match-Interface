"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const prompts = require("../src/shared/ai-turn-prompt");
const rubric = require("../src/shared/ethics-bowl-rubric");

const phases = [
    { kind: "speech", subtype: "presentation", duration: 300 },
    { kind: "speech", subtype: "commentary", duration: 180 },
    { kind: "speech", subtype: "response", duration: 180 },
    { kind: "judgeAnswer", judgeNumber: 1, duration: 140 }
];

test("blank optional instructions give only names and the selected response language", () => {
    for (const additionalInstructions of ["", "  \n"]) {
        assert.equal(prompts.buildParticipantSystemPrompt({participantName:"Alex",opponentName:"Morgan",locale:"fr-ca",additionalInstructions}),
            "You are Alex, a participant in a live Ethics Bowl match against Morgan.\n\nResponse language: Québec French");
    }
});

test("nonempty optional instructions are appended intact after factual identity and language", () => {
    const additionalInstructions = "Explore uncertainty.\nUse the examples I supplied.";
    const prompt = prompts.buildParticipantSystemPrompt({participantName:"Alex",opponentName:"Morgan",additionalInstructions});
    assert.ok(prompt.endsWith(`Additional model instructions:\n${additionalInstructions}`));
    assert.match(prompt,/Response language: English/);
});

test("every contestant phase retains full case, moderator question, phase, role and prior discussion", () => {
    const caseText = `[CASE START]${"full case ".repeat(2000)}[CASE END]`;
    const transcript = `[CASE 1 EARLY]${"prior discussion ".repeat(2000)}[CASE 2 LATEST]`;
    for (const phase of phases) {
        const prompt = prompts.buildAiTurnPrompt({
            phase:{...phase,caseNum:2,title:`Second case ${phase.subtype || "judge answer"}`},
            participantRole:"Presenting participant",
            caseData:{title:"Complete context",question:"What should happen?",text:caseText},
            transcript,judgeQuestion:"Would this change your conclusion?",
            scoringCriteria:rubric.buildTurnCriteria({phase})
        });
        for (const context of [caseText,transcript,"What should happen?","Presenting participant","Second case"])
            assert.ok(prompt.includes(context),`${phase.subtype || phase.kind}: missing ${context.slice(0,60)}`);
        assert.doesNotMatch(prompt,/clipped|Length target|Hard cap|word count|first sentence|start with|plain text only|Do not mention|Do not use headings/i);
        assert.ok(prompt.endsWith(prompts.buildWordTargetInstruction({duration:phase.duration})));
        if (phase.kind === "judgeAnswer") assert.ok(prompt.includes("Would this change your conclusion?"));
    }
});

test("phase actions request only presenting, commenting, responding, or answering", () => {
    assert.deepEqual(phases.map(prompts.getPhaseInstruction), [
        "Present an answer to the moderator's question.",
        "Comment on the other participant's presentation.",
        "Respond to the commentary.",
        "Answer the judge's question."
    ]);
    assert.equal(prompts.getPhaseInstruction({kind:"confer"}),"");
});


test("contestant prompts use one exact-word instruction and omit time directives", () => {
    const expected = {en:{300:700,180:420,140:330},"fr-ca":{300:675,180:405,140:315}};
    for (const [locale, durations] of Object.entries(expected)) {
        for (const [seconds, target] of Object.entries(durations)) {
            const duration = Number(seconds), phase = {kind:duration === 140 ? "judgeAnswer" : "speech",subtype:duration === 300 ? "presentation" : "commentary",duration};
            assert.deepEqual(prompts.getWordTarget({duration,locale}),{target});
            const prompt = prompts.buildAiTurnPrompt({phase,locale});
            assert.ok(prompt.includes(`Write exactly ${target} words.`));
            assert.ok(prompt.split("\n\n").at(-1) === `Write exactly ${target} words.`);
            assert.doesNotMatch(prompt,/Time available|seconds|minutes|about \d+ words|\d+–\d+ words/i);
            assert.doesNotMatch(prompts.buildJudgeAnswerPrompt({duration,locale}),/Time available|seconds|minutes/i);
        }
    }
    assert.equal(prompts.buildWordTargetInstruction({duration:NaN}),"");
    assert.equal(prompts.getWordTarget({duration:0}),null);
    assert.doesNotMatch(prompts.buildAiTurnPrompt({phase:{kind:"confer",duration:180}}),/Write exactly|Word target/);
});


test("exact-word instruction snapshots preserve all four contestant phase actions and both language targets",()=>{
    const values={en:[700,420,420,330],"fr-ca":[675,405,405,315]};
    const all=[phases[0],phases[1],{kind:"speech",subtype:"response",duration:180},phases[3]];
    for(const [locale,targets]of Object.entries(values)){
        for(const [i,phase]of all.entries()){
            const prompt=prompts.buildAiTurnPrompt({phase:{...phase,caseNum:1},locale,caseData:{title:"Complete case",question:"Moderator question?",text:"Full case text"},participantRole:"Presenting participant",transcript:"Full prior discussion",judgeQuestion:"Judge question?",scoringCriteria:"Official rubric"});
            assert.equal(prompt,["Current case: 1 — Complete case","Moderator question: Moderator question?","Case text:\nFull case text",`Current phase: ${phase.subtype||phase.kind}`,"Participant role in this case: Presenting participant",phase.kind==="judgeAnswer"?"Judge question:\nJudge question?":"","Prior discussion in this match:\nFull prior discussion","Official rubric",prompts.getPhaseInstruction(phase),`Write exactly ${targets[i]} words.`].filter(Boolean).join("\n\n"));
            assert.equal((prompt.match(/Write exactly \d+ words\./g)||[]).length,1);
            assert.doesNotMatch(prompt,/Time available|Word target:|Check the word count|rewrite|revise/i);
        }
    }
    assert.doesNotMatch(prompts.buildJudgeQuestionPrompt({judgeNumber:1}),/Write exactly/);
});


test("judge questions have a maximum75-word instruction with addressee and JSON format intact",()=>{
 for(const locale of ['en','fr-ca']){
  const prompt=prompts.buildJudgeQuestionPrompt({judgeNumber:2,questionedParticipant:'Alex Morgan',locale});
  assert.ok(prompt.includes('Ask one question to Alex Morgan in no more than 75 words.'));
  assert.doesNotMatch(prompt,/Write exactly|exactly 75|revise|rewrite|padding/i);
  assert.match(prompt,/question/);assert.match(prompt,/JSON/);
 }
});
