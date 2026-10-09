const rendererHarness=require("./helpers/renderer-harness");
const declaration=rendererHarness.declaration;
"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source = rendererHarness.source();
const policy=require('../src/shared/phase-timer-policy');


test('both participant roles independently support manual turns and human timers across phases',async()=>{
 for(const one of ['human','ai'])for(const two of ['human','ai']){
  const entries=[],c=vm.createContext({state:{participantTypes:{human:one,ai:two}},sanitizeText:text=>text.trim(),appendParticipantMessage:(...args)=>entries.push(args),primeAiFinalScoringAfterFinalTurn:()=>{},messageInputEl:{value:'draft'}});
  rendererHarness.install(c,['isAiControlledRole','isHumanControlledRole','isHumanSubmissionPhase','appendHumanTurnMessage','maybePrepareAiTurnForPhase']);
  for(const role of ['human','ai'])for(const kind of ['speech','judgeAnswer']){
   const phase={id:`${role}-${kind}`,speaker:role,kind,caseNum:role==='human'?1:2,duration:140};
   const human=(role==='human'?one:two)==='human';assert.equal(c.isHumanSubmissionPhase(phase),human);
   if(human){assert.equal(await c.maybePrepareAiTurnForPhase(phase),'');assert.ok(c.appendHumanTurnMessage(phase,'Full manual answer.'));assert.equal(entries.at(-1)[0],role);assert.equal(entries.at(-1)[1],'Full manual answer.');assert.equal(policy.startsWithAutoSpeech(phase,{speakerIsAiControlled:false}),false);}
  }
 }
});

test('hybrid mode generates AI questions and refuses every AI final-score entry point',async()=>{
 const c=vm.createContext({state:{judgeMode:'hybrid'},l:en=>en});rendererHarness.install(c,['usesAiJudgeQuestions','usesAiFinalScoring','maybePrepareAiFinalJudgeScorecard','maybePrepareAllAiFinalScorecards','generateAiFinalScores']);
 for(const mode of ['ai','hybrid','human']){
  assert.equal(c.usesAiJudgeQuestions(mode),mode!=='human');assert.equal(c.usesAiFinalScoring(mode),mode==='ai');
  assert.equal(policy.startsWithAutoSpeech({kind:'judgeQuestion',duration:60},{judgeMode:mode}),mode!=='human');
  if(mode!=='ai'){c.state.judgeMode=mode;for(const name of ['maybePrepareAiFinalJudgeScorecard','maybePrepareAllAiFinalScorecards','generateAiFinalScores'])await assert.rejects(c[name](1),/human judges/);}
 }
});

test('a human second participant controls its own coin-toss choice',()=>{
 const calls=[],c=vm.createContext({state:{waitingForCoinChoice:true,coinWinner:'ai'},coinChoicePanelEl:{hidden:false},applyCaseOneChoice:(...args)=>calls.push(args),beginStructuredMatch:()=>calls.push(['begin'])});rendererHarness.install(c,['handleHumanCoinChoice']);c.handleHumanCoinChoice('pass');assert.deepEqual(calls,[['ai','pass'],['begin']]);assert.equal(c.state.waitingForCoinChoice,false);
});
