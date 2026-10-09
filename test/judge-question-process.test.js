const rendererHarness=require("./helpers/renderer-harness");
const declaration=rendererHarness.declaration;
"use strict";
const test=require("node:test"), assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const prompts=require("../src/shared/ai-turn-prompt"),rubric=require("../src/shared/ethics-bowl-rubric"),catalog=require("../src/shared/model-catalog");
const source = rendererHarness.source();

function harness(generate=async()=>JSON.stringify({question:"Why?"}),instructions=""){
 const calls=[],state={matchRunId:1,judgeMode:"ai",judgePanelPreset:"gpt-majority",currentPhaseIndex:0,
  names:{human:"Alex",ai:"Morgan"},leadByCase:{1:"human",2:"ai"},
  phases:[{id:"previous-answer",kind:"judgeAnswer",caseNum:2,judgeNumber:1},{id:"current-question",kind:"judgeQuestion",caseNum:2,judgeNumber:2}],
  cases:{2:{title:"Complete case",text:"[START]"+"full context ".repeat(2000)+"[END]",question:"Should this be done?"}},
  transcript:[{kind:"ai",caseNum:1,label:"Alex",text:"Earlier case discussion.",speechDeliveryState:"complete"},{kind:"judge",caseNum:2,label:"Judge 1",text:"Prior question?",speechDeliveryState:"complete"}],
  judgeQuestionCache:{1:[],2:[]},aiJudgeQuestionPreparationPromises:{},aiJudgeQuestionPreparationErrors:{}};
 const context=vm.createContext({state,activeLocale:"en",MODEL_CATALOG:catalog,AI_TURN_PROMPTS:prompts,ETHICS_BOWL_RUBRIC:rubric,
  STORAGE_KEYS:{instructions:"debate.instructions"},localStorage:{getItem:()=>instructions},JUDGE_REASONING_EFFORT:catalog.REASONING_POLICIES.judge,DEFAULT_JUDGE_MODEL:catalog.DEFAULT_JUDGE_MODEL,
  refreshCredentialStatus:async()=>{},hasCredential:()=>true,formatModelLabel:model=>model,
  getCurrentPhase:()=>state.phases[state.currentPhaseIndex],window:{ethicsApi:{ai:{generate:async request=>{calls.push(request);return generate(request);}}}}});
  rendererHarness.install(context,["isFrenchLocale","l","caseLabel","phaseSubtypeLabel","judgeLabel","sanitizeText","getStoredText","speakerName","getPhaseById","isSubstantiveTranscriptMessage","substantiveTranscriptAsPlainText","getModelProvider","usesAiJudgeQuestions","getJudgeModel","getAiBridge","requireProviderCredential","callAI","stripJsonFence","extractJsonObject","getCachedAiJudgeQuestion","cacheAiJudgeQuestion","getAiJudgeQuestionPreparationKey","buildAiJudgeQuestionPrompt","ensureAiJudgeQuestion","maybePrepareAiJudgeQuestion"]);
 return{context,state,calls};
}

test("judge question matches the approved template with all rubric bands/notes and optional instructions",()=>{
 for(const locale of ["en","fr-ca"])for(const instructions of ["","  \n","Optional question instructions."]){
  const criteria=rubric.buildFullCriteria({locale});
  const args={judgeNumber:2,locale,participantNames:["Alex","Morgan"],questionedParticipant:"Morgan",caseData:{title:"Case title",text:"Complete case",question:"Moderator question?"},transcript:"Entire prior match including earlier Q&A",scoringCriteria:criteria,additionalInstructions:instructions};
  assert.equal(prompts.buildJudgeQuestionPrompt(args),[
   "You are Judge 2 in an Ethics Bowl match.",`Language: ${locale==="en"?"English":"Québec French"}.`,"Participants: Alex, Morgan.","Participant being questioned: Morgan.","Current case: Case title\nComplete case","Moderator’s question: Moderator question?","Current phase: Judges’ questions.","Time available for your question: 60 seconds.","Prior discussion: Entire prior match including earlier Q&A",`Scoring criteria:\n${criteria}`,instructions.trim()?`Additional instructions:\n${instructions}`:"","Ask one question to Morgan in no more than 75 words.","Avoid repeating an earlier judge’s question.",'Return JSON {"question":"..."}.'
  ].filter(Boolean).join("\n\n"));
  for(const value of Object.values(rubric.CRITERIA)){
   assert.ok(criteria.includes(rubric.formatCriterion(value)));
   for(const band of value.bands)assert.ok(criteria.includes(band.text));
  }
  assert.match(criteria,/starts.*0 points/);assert.match(criteria,/total 60/);assert.match(criteria,/not 20 points for each answer/);assert.match(criteria,/scored once for the entire match/);
 }
});

test("questions wait for their active phase, see preceding answers and make one generation without pre-drafts or revision",async()=>{
 const{context,state,calls}=harness(undefined,"My optional instructions.");
 assert.equal(await context.maybePrepareAiJudgeQuestion(2,2),"");assert.equal(calls.length,0,"no question generated during preceding answer");
 state.transcript.push({kind:"ai",caseNum:2,label:"Morgan",phaseId:"previous-answer",text:"The completed preceding answer.",speechDeliveryState:"complete"});
 state.currentPhaseIndex=1;
 assert.equal(await context.maybePrepareAiJudgeQuestion(2,2),"Why?","short questions are not substantively rewritten");
 assert.equal(calls[0].reasoningEffort,"high");assert.equal(calls[0].maxTokens,25600);assert.equal(calls[0].requestTimeoutMs,180000);
 assert.equal(calls.length,1);assert.equal(calls[0].model,"gpt-6-astra");assert.equal(calls[0].systemPrompt,"");
 for(const value of [state.cases[2].text,"Earlier case discussion.","Prior question?","The completed preceding answer.","My optional instructions.","Ask one question to Morgan in no more than 75 words."])assert.ok(calls[0].userPrompt.includes(value));
 assert.doesNotMatch(calls[0].userPrompt,/pressure-test|hidden assumption|academic philosopher|revision pass|word count|around 500|length target/i);
 assert.equal(await context.maybePrepareAiJudgeQuestion(2,2),"Why?");assert.equal(calls.length,1);
 assert.doesNotMatch(declaration("enterCurrentPhase"),/primeAiJudgeQuestion|primeCurrentAiJudgeQuestion/);
 assert.doesNotMatch(declaration("generateAiTurnForPhase"),/primeNextFinalJudgeQuestion/);
 assert.doesNotMatch(source,/function (?:reviseDraftedAiJudgeQuestion|maybeDraftAiJudgeQuestion|generateInitialAiJudgeQuestionDraft)\(/);
});

test("question generation deduplicates concurrent calls and discards cancelled match results",async()=>{
 for(const cancel of [false,true]){
  let release;const pending=new Promise(resolve=>release=resolve);
  const{context,state,calls}=harness(()=>pending);state.currentPhaseIndex=1;
  const one=context.maybePrepareAiJudgeQuestion(2,2),two=context.maybePrepareAiJudgeQuestion(2,2);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);
  if(cancel)state.matchRunId++;
  release(JSON.stringify({question:"What follows from this?"}));
  const results=await Promise.all([one,two]);
  assert.deepEqual(results,cancel?["",""]:["What follows from this?","What follows from this?"]);
  assert.equal(Object.keys(state.aiJudgeQuestionPreparationPromises).length,0);
  if(cancel)assert.equal(state.judgeQuestionCache[2].length,0);
 }
});

test("approved contestant answer template preserves exact question, full context, rubric scope and blank optional default",()=>{
 for(const locale of ["en","fr-ca"])for(const instructions of ["","Saved optional instructions."]){
  const criteria=rubric.buildTurnCriteria({phase:{kind:"judgeAnswer"},locale});
  const actual=prompts.buildJudgeAnswerPrompt({participantName:"Morgan",opponentName:"Alex",locale,caseData:{title:"Case title",text:"Complete full case",question:"Moderator question?"},transcript:"Entire prior Q&A",scoringCriteria:criteria,additionalInstructions:instructions,judgeNumber:2,judgeQuestion:"Do you still agree?"});
  assert.equal(actual,["You are Morgan, a participant in a live Ethics Bowl match against Alex.",`Language: ${locale==="en"?"English":"Québec French"}.`,"Case: Case title\nComplete full case","Moderator’s question: Moderator question?","Current phase: Answering a judge’s question.","Prior discussion: Entire prior Q&A",`Scoring criteria:\n${criteria}`,instructions?`Additional instructions:\n${instructions}`:"","Judge 2 asks: Do you still agree?","Answer the judge’s question.",locale==="en"?"Write exactly 330 words.":"Write exactly 315 words."].filter(Boolean).join("\n\n"));
  assert.ok(actual.includes(rubric.formatCriterion(rubric.CRITERIA.judgesQuestions)));assert.ok(actual.includes(rubric.formatCriterion(rubric.CRITERIA.respectfulDialogue)));
  assert.doesNotMatch(actual,/first sentence|begin with|word count|revision|charitable tone/);
 }
});
