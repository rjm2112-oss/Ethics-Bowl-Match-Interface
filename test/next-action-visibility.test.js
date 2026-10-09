'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),match=require('../src/renderer/match');
function fixture(phase,types={human:'ai',ai:'ai'},mode='ai'){
 const state={started:true,phaseReady:true,matchRunId:3,judgeMode:mode,participantTypes:types},button={},scheduled=[],generated=[];
 const context={state,ui:{nextActionBtnEl:button},services:{l:en=>en,isFrenchLocale:()=>false,judgeLabel:n=>'Judge '+n,isAiControlledRole:r=>types[r]==='ai',isHumanControlledRole:r=>types[r]==='human',usesAiJudgeQuestions:()=>mode!=='human',usesAiFinalScoring:()=>mode==='ai',getPreparedAiTurnText:()=>'',getCurrentPhase:()=>phase,generateAiTurnForPhase:p=>generated.push(p)},platform:{window:{setTimeout:f=>{scheduled.push(f);return 1;},clearTimeout(){}},console}};
 const api=match.create(context);return {state,button,api,scheduled,generated};
}
test('normal automatic AI actions remain hidden before preparation, while busy and during playback',()=>{
 for(const phase of [{id:'p',kind:'speech',speaker:'ai'},{id:'a',kind:'judgeAnswer',speaker:'human'},{id:'c',kind:'confer',speaker:'ai'},{id:'q',kind:'judgeQuestion',judgeNumber:1},{id:'f',kind:'closing'}])for(const ready of [false,true])for(const locked of [false,true]){const f=fixture(phase);f.state.phaseReady=ready;f.api.refreshNextActionControl(phase,locked,locked);assert.equal(f.button.hidden,true);}
});
test('only the current blocked automatic action shows a context-specific enabled retry',()=>{
 for(const [phase,label] of [[{id:'p',kind:'speech',speaker:'ai'},'Retry AI Turn'],[{id:'a',kind:'judgeAnswer',speaker:'human'},'Retry AI Answer'],[{id:'c',kind:'confer',speaker:'ai'},'Retry AI Confer'],[{id:'q',kind:'judgeQuestion',judgeNumber:2},'Retry Judge 2 Question'],[{id:'f',kind:'closing'},'Retry Final Decision']]){const f=fixture(phase);f.state.autoGenerationBlockedPhaseId='old';f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,true);f.state.autoGenerationBlockedPhaseId=phase.id;f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,false);assert.equal(f.button.disabled,false);assert.equal(f.button.textContent,label);f.api.refreshNextActionControl(phase,true,false);assert.equal(f.button.disabled,true);}
});
test('valid cutoff transcription recovery is visible with phaseReady false; stale recovery stays hidden',()=>{
 const phase={id:'p',kind:'speech',speaker:'ai'},f=fixture(phase);f.state.phaseReady=false;f.state.spokenAudioCutoffRetry={runId:3,prepared:{entry:{phaseId:'p'}}};f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,false);assert.equal(f.button.textContent,'Retry transcription');assert.equal(f.button.disabled,false);f.api.refreshNextActionControl(phase,true,false);assert.equal(f.button.disabled,true);for(const retry of [{runId:2,prepared:{entry:{phaseId:'p'}}},{runId:3,prepared:{entry:{phaseId:'old'}}}]){f.state.spokenAudioCutoffRetry=retry;f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,true);}
});
test('all four participant mixes and human/hybrid manual actions retain existing controls',()=>{
 for(const one of ['human','ai'])for(const two of ['human','ai'])for(const mode of ['ai','hybrid','human'])for(const role of ['human','ai']){const phase={id:'c',kind:'confer',speaker:role},types={human:one,ai:two},f=fixture(phase,types,mode);f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,types[role]==='ai');if(types[role]==='human')assert.equal(f.button.textContent,'Advance');}
 for(const mode of ['hybrid','human']){const phase={id:'f',kind:'closing'},f=fixture(phase,undefined,mode);f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,false);assert.equal(f.button.textContent,'Compute Human-Judge Result');}
 for(const n of [1,2]){const phase={id:'s',kind:'scoring',caseNum:n},f=fixture(phase);f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,false);assert.equal(f.button.disabled,false);}
});
test('automatic scheduler invokes the normal generation handler while button is hidden',async()=>{
 const phase={id:'p',kind:'speech',speaker:'ai'},f=fixture(phase);f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,true);f.api.scheduleNextActionForPhase(phase.id);assert.equal(f.scheduled.length,1);await f.scheduled[0]();assert.deepEqual(f.generated,[phase]);assert.equal(f.state.pendingAutoActionPhaseId,'');
});

test('manual retry dispatches the same generation handler once, and completion hides stale recovery',async()=>{
 const phase={id:'p',kind:'speech',speaker:'ai'},f=fixture(phase);f.state.autoGenerationBlockedPhaseId=phase.id;f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,false);await f.api.handleNextAction();assert.deepEqual(f.generated,[phase]);f.state.completed=true;f.api.refreshNextActionControl(phase,false,false);assert.equal(f.button.hidden,true);assert.equal(f.button.disabled,true);
});
