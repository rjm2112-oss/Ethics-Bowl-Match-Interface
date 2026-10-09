const rendererHarness=require("./helpers/renderer-harness");
const declaration=rendererHarness.declaration;
"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const {createProviderService}=require("../src/main/provider-service");
const {validateGenerateRequest}=require("../src/main/validation");
const source = rendererHarness.source();


test("boundary-length full prompts survive service validation and both provider adapters",async()=>{
 const systemPrompt="[SYSTEM-START]"+"S".repeat(149974)+"[SYSTEM-END]",userPrompt="[USER-START]"+"U".repeat(499978)+"[USER-END]";
 assert.equal(systemPrompt.length,150000);assert.equal(userPrompt.length,500000);
 const calls=[];const service=createProviderService({credentialStore:{get:async()=>"test-key"},fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify(url.includes('anthropic')?{stop_reason:"end_turn",content:[{type:"text",text:"Complete"}]}:{status:"completed",output_text:"Complete"}),{status:200});},sleep:async()=>{}});
 for(const model of ['gpt-6-luna','claude-haiku-5-5']){
  assert.equal(await service.generate({model,systemPrompt,userPrompt,maxTokens:10}),"Complete");const body=calls.at(-1);assert.equal(body.input||body.messages[0].content,userPrompt);assert.equal(body.instructions||body.system,systemPrompt);
 }
 for(const [field,limit] of [['systemPrompt',150000],['userPrompt',500000]]){
  await assert.rejects(service.generate({model:'gpt-6-luna',userPrompt:'Full prompt', [field]:'X'.repeat(limit+1)}),/Nothing was truncated or sent.*Explicitly shorten/);
 }assert.equal(calls.length,2);
});

test("complete speech is chunked without clipping, and an oversized unbroken segment fails explicitly",()=>{
 const c=vm.createContext({SPEECH_CHUNK_MAX:800,MAX_TTS_CHARS:4096,l:en=>en});rendererHarness.install(c,['normalizeSpeechText','splitTextByWords','chunkTextForSpeech','buildSpeechQueueEntries']);
 const text="Beginning. "+"full original speech, ".repeat(1000)+"Final exact words.";
 const chunks=c.buildSpeechQueueEntries('ai',text);assert.equal(chunks.map(chunk=>chunk.text).join(' '),c.normalizeSpeechText(text));assert.ok(chunks.length>1);assert.ok(chunks.every(chunk=>chunk.text.length<=4096));
 assert.throws(()=>c.buildSpeechQueueEntries('ai','Z'.repeat(4097)),/nothing was clipped/);
});

test("final scoring includes both complete cases and the complete substantive match transcript",()=>{
 const c=vm.createContext({state:{transcript:[{kind:'ai',caseNum:1,label:'Alex',text:'Full transcript 1',speechDeliveryState:'complete'},{kind:'ai',caseNum:2,label:'Morgan',text:'Full transcript 2',speechDeliveryState:'complete'}],cases:{1:{title:'One',question:'Question one',text:'[CASE-1-END]'},2:{title:'Two',question:'Question two',text:'[CASE-2-END]'}},leadByCase:{1:'human',2:'ai'}},caseLabel:n=>`Case ${n}`,speakerName:r=>r,otherRole:r=>r==='human'?'ai':'human',substantiveTranscriptAsPlainText:n=>`Full transcript ${n}`,l:en=>en});rendererHarness.install(c,['scoringTranscriptAsPlainText']);const text=c.scoringTranscriptAsPlainText();for(const token of ['[CASE-1-END]','[CASE-2-END]','Full transcript 1','Full transcript 2','Question one','Question two'])assert.ok(text.includes(token));
});

for (const locale of ["en", "fr-ca"]) {
 test(`${locale}: every turn and judge question sees only its own case, while final scoring sees both`, () => {
  const leadByCase = {1: "human", 2: "ai"};
  const phases = require("../src/shared/match-phases").build({leadByCase, locale});
  const state = {
   locale, phases, leadByCase, names: {human: "Alex", ai: "Morgan"}, transcript: [],
   cases: {
    1: {title: "First case", question: "FIRST_CASE_MODERATOR_QUESTION", text: "FIRST_CASE_CONTENT " + "Full first narrative. ".repeat(1000) + "FIRST_CASE_END"},
    2: {title: "Second case", question: "SECOND_CASE_MODERATOR_QUESTION", text: "SECOND_CASE_CONTENT " + "Full second narrative. ".repeat(1000) + "SECOND_CASE_END"}
   }
  };
  const c = rendererHarness.load(["buildAiTurnPrompt", "buildAiJudgeQuestionPrompt", "scoringTranscriptAsPlainText"], {
   state, activeLocale: locale, localStorage: {getItem: () => ""}
  });
  for (const phase of phases.filter(item => ["speech", "judgeQuestion", "judgeAnswer"].includes(item.kind))) {
   const otherCase = state.cases[phase.caseNum === 1 ? 2 : 1];
   if (phase.kind === "judgeAnswer") state.askedJudgeQuestions[phase.id] = `DELIVERED_${phase.id.replace(/-answer$/, "-question")}_END`;
   const prompt = phase.kind === "judgeQuestion"
    ? c.buildAiJudgeQuestionPrompt(phase.caseNum, phase.judgeNumber)
    : c.buildAiTurnPrompt(phase);
   assert.ok(prompt.includes(state.cases[phase.caseNum].text), "preserve the complete current case");
   assert.ok(prompt.includes(state.cases[phase.caseNum].question));
   assert.ok(!prompt.includes(otherCase.question));
   assert.ok(!prompt.includes(otherCase.text.split(" ")[0]));
   for (const message of state.transcript) {
    assert.equal(prompt.includes(message.text), message.caseNum === phase.caseNum, `context scope for ${phase.id}: ${message.phaseId}`);
   }
   if (phase.subtype === "presentation") assert.match(prompt, /No prior discussion yet/);
   state.transcript.push({
    kind: phase.kind === "judgeQuestion" ? "judge" : "ai",
    label: "Speaker", phaseId: phase.id, caseNum: phase.caseNum,
    text: `DELIVERED_${phase.id}_END`, speechDeliveryState: "complete"
   });
  }
  const scoring = c.scoringTranscriptAsPlainText();
  for (const data of Object.values(state.cases)) {
   assert.ok(scoring.includes(data.text));
   assert.ok(scoring.includes(data.question));
  }
  for (const message of state.transcript) assert.ok(scoring.includes(message.text));
 });
}
