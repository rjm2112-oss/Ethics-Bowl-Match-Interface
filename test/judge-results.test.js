'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),h=require('./helpers/renderer-harness');
function element(tag){return {tag,dataset:{},children:[],appendChild(x){return this.insertBefore(x,null);},insertBefore(x,before){x.parent?.removeChild(x);const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,x);x.parent=this;return x;},removeChild(x){this.children.splice(this.children.indexOf(x),1);x.parent=null;},querySelector(selector){return this.children.find(child=>child.className===selector.slice(1))||this.children.map(child=>child.querySelector?.(selector)).find(Boolean)||null;},set innerHTML(x){this.children=[];},get innerHTML(){return '';}};}
const full={presentationQuestion:5,presentationEthics:5,presentationViewpoints:5,responseToFeedback:10,judgesQuestions:20,commentary:10,respectfulDialogue:5};
function fixture(){
 const state={started:true,matchRunId:9,judgeMode:'ai',names:{human:'Alex',ai:'Morgan'},cases:{1:{title:'One',text:'Narrative one',question:'Why one?'},2:{title:'Two',text:'Narrative two',question:'Why two?'}},leadByCase:{1:'human',2:'ai'},transcript:[{kind:'ai',label:'Alex',caseNum:1,text:'Delivered discussion.',speechDeliveryState:'complete'}]},requests=[],pending=[],tts=[],renders=[];
 const c=h.load(['maybePrepareAiFinalJudgeScorecard','publishJudgeScorecard','appendMessage','renderScorecards','scoringTranscriptAsPlainText','getMostRecentReadableTranscriptIndex'],{
  AUTO_SPEAK_MESSAGE_KINDS:new Set(['ai','ai-alt','human','moderator','judge']),state,chatEl:element('div'),emptyStateEl:{},document:{createElement:element},formatBubbleTime:()=>'',getMessageBodyEl:()=>null,l:en=>en,isFrenchLocale:()=>false,speakerName:r=>r==='human'?'Alex':'Morgan',judgeLabel:n=>'Judge '+n,sanitizeText:x=>String(x||'').trim(),getJudgeModel:n=>'mock-'+n,
  renderTranscript:()=>renders.push(state.transcript.length),getVoiceKeyForMessage:()=>'',shouldAutoSpeakMessage:()=>true,enqueueTranscriptSpeech:(...args)=>tts.push(args),
  buildAiScoringSystemPrompt:()=> 'Approved independent prompt',buildAiSingleJudgeScoringPrompt:x=>x,callAI:request=>{requests.push(request);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},scoreCardsEl:{innerHTML:''},scoreSummaryEl:{}
 });return {c,state,requests,pending,tts,renders};
}
function raw(comment='Team-level feedback.'){return {participantOne:{...full,didWell:comment,needsImprovement:'One improvement.'},participantTwo:{...full,commentary:9,didWell:'Two strengths.',needsImprovement:'Two improvement.'}};}
test('judge results publish out of order as ready, stay silent, retry only missing judge, and never enter scoring prompts',async()=>{
 const f=fixture(),base=f.c.scoringTranscriptAsPlainText();
 const one=f.c.maybePrepareAiFinalJudgeScorecard(1),two=f.c.maybePrepareAiFinalJudgeScorecard(2),three=f.c.maybePrepareAiFinalJudgeScorecard(3);const failed=assert.rejects(three,/temporary/);
 assert.equal(f.state.transcript.length,1);
 f.pending[1].resolve(raw('Comment two.'));const cardTwo=await two;
 assert.deepEqual(f.state.transcript.filter(m=>m.kind==='judge-result').map(m=>m.scorecard.judgeNumber),[2]);assert.equal(f.c.scoringTranscriptAsPlainText(),base);
 f.pending[2].reject(Error('temporary'));await failed;f.pending[0].resolve(raw('Comment one.'));await one;
 assert.equal(await f.c.maybePrepareAiFinalJudgeScorecard(2),cardTwo);assert.equal(f.requests.length,3);assert.equal(f.state.transcript.filter(m=>m.kind==='judge-result').length,2);
 const retry=f.c.maybePrepareAiFinalJudgeScorecard(3);assert.equal(f.requests.length,4);assert.equal(f.requests[3].userPrompt,base);f.pending[3].resolve(raw('Comment three.'));await retry;
 const cards=[1,2,3].map(n=>f.state.aiFinalJudgeScorecards[n]);f.c.renderScorecards(cards,require('../src/shared/scorecard-tally').computeVoteTally(cards));
 assert.equal(f.state.transcript.filter(m=>m.kind==='judge-result').length,3);assert.equal(f.c.scoringTranscriptAsPlainText(),base);assert.deepEqual(f.tts,[]);assert.equal(f.c.getMostRecentReadableTranscriptIndex(),0);
 for(const m of f.state.transcript.filter(m=>m.kind==='judge-result')){assert.equal(m.substantive,false);assert.equal(m.speechDeliveryState,'complete');assert.equal(m.scorecard.humanScore,60);assert.equal(m.scorecard.aiScore,59);assert.ok(m.scorecard.humanBreakdown);}
 for(const request of f.requests){assert.equal(request.userPrompt,base);assert.doesNotMatch(request.userPrompt,/Comment (one|two|three)|60\/60|59\/60/);}
 assert.equal(f.c.scoreCardsEl.innerHTML,'');assert.match(f.c.scoreSummaryEl.textContent,/3 votes/);
});
test('changed judge result replaces its dialogue row without duplicate or speech',()=>{
 const f=fixture();f.c.publishJudgeScorecard({...require('../src/shared/final-scoring').normalize(raw(),1)});f.c.publishJudgeScorecard({...require('../src/shared/final-scoring').normalize(raw('Updated overall comment.'),1)});
 assert.equal(f.state.transcript.length,2);assert.match(f.state.transcript[1].text,/Updated/);assert.equal(f.state.transcript[1].scorecard.humanComments.didWell,'Updated overall comment.');assert.deepEqual(f.tts,[]);
});
test('reset, close and changed context discard in-flight judge results',async()=>{
 for(const cause of ['reset','close','context']){const f=fixture(),p=f.c.maybePrepareAiFinalJudgeScorecard(1);if(cause==='reset')f.state.matchRunId++;if(cause==='close')f.state.sessionClosed=true;if(cause==='context')f.state.transcript[0].text='Updated actual discussion';f.pending[0].resolve(raw());assert.equal(await p,null);assert.equal(f.state.transcript.filter(m=>m.kind==='judge-result').length,0);assert.deepEqual(f.tts,[]);}
});
test('historical human and hybrid results keep their original comment without fabricating paired feedback',()=>{
 for(const mode of ['human','hybrid']){const f=fixture();f.state.judgeMode=mode;const card={judgeNumber:1,name:'Sam',humanScore:44,aiScore:43,comment:'Entered overall comment.'};f.c.publishJudgeScorecard(card);const m=f.state.transcript[1];assert.equal(m.scorecard.humanBreakdown,undefined);assert.equal(m.scorecard.humanScore,44);assert.equal(m.scorecard.comment,card.comment);assert.deepEqual(f.tts,[]);}
});
test('new result render uses safe text nodes, fourteen criterion scores and two totals, four team-level comments',()=>{
 const element=tag=>({tag,textContent:'',children:[],appendChild(x){this.children.push(x);}}),flatten=e=>[e,...e.children.flatMap(flatten)],body=element('div');
 const c=h.load(['renderJudgeScorecardBody'],{l:(en,fr)=>fr,document:{createElement:element}});const card={...require('../src/shared/final-scoring').normalize(raw('<script>not executed</script>'),1),participantNames:{human:'Alex',ai:'Morgan'}};c.renderJudgeScorecardBody(body,card);const nodes=flatten(body);
 assert.equal(nodes.filter(n=>n.tag==='td').length,16);assert.equal(nodes.filter(n=>n.className==='judge-result-comment judge-result-comment-body').length,4);assert.ok(nodes.some(n=>n.textContent==='Clarté et cohérence'));assert.equal(nodes.find(n=>n.className==='judge-result-comment judge-result-comment-body').textContent,card.humanComments.didWell);assert.equal(nodes.filter(n=>n.tag==='script').length,0);
});
