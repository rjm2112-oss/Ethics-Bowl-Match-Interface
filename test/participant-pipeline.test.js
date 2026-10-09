const rendererHarness=require("./helpers/renderer-harness");
const declaration=rendererHarness.declaration;
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const catalog = require("../src/shared/model-catalog");
const prompts = require("../src/shared/ai-turn-prompt");
const rubric = require("../src/shared/ethics-bowl-rubric");
const {createProviderService} = require("../src/main/provider-service");
const {planWholeSpeechPlayback} = require("../src/shared/speech-timing");

// Run the actual renderer declarations, mocking only storage, IPC and UI/audio
// boundaries. This catches extra generation calls in the orchestration itself.
const source = rendererHarness.source();

function createRenderer(generate, storedInstructions = "") {
    const values = new Map([["debate.instructions",storedInstructions]]);
    const calls = [], audio = [];
    const state = {
        matchRunId:1,names:{human:"Alex",ai:"Morgan"},participantTypes:{human:"ai",ai:"ai"},
        participantModels:{human:"gpt-6-luna",ai:"claude-haiku-5-5"},leadByCase:{1:"human",2:"ai"},
        cases:{1:{title:"First",question:"First question",text:"Earlier case"},2:{title:"Second",question:"Should we do this?",text:"[FULL CASE]"+"context ".repeat(2000)+"[CASE END]"}},
        transcript:[{kind:"ai-alt",caseNum:1,label:"Alex",text:"[EARLY]"+"earlier discussion ".repeat(1600)+"[EARLY END]"},{kind:"ai",caseNum:2,label:"Morgan",text:"The recent presentation."},{kind:"ai",caseNum:2,label:"Morgan",text:"I yield my time",substantive:false}],
        phases:[],aiPreparedTurns:{},aiPreparationPromises:{},aiPreparationErrors:{},
        askedJudgeQuestions:{},lastJudgeQuestionByCase:{}
    };
    state.transcript.forEach(message=>{message.speechDeliveryState="complete";});
    const context = vm.createContext({
        state,activeLocale:"en",AI_TURN_PROMPTS:prompts,ETHICS_BOWL_RUBRIC:rubric,
        STORAGE_KEYS:{instructions:"debate.instructions"},DEFAULT_JUDGE_MODEL:catalog.DEFAULT_JUDGE_MODEL,
        DEFAULT_PARTICIPANT_MODEL:catalog.DEFAULT_PARTICIPANT_MODEL,
        localStorage:{getItem:key=>values.get(key)||null},
        MODEL_CATALOG:catalog,
        refreshCredentialStatus:async()=>{},hasCredential:()=>true,formatModelLabel:value=>value,
        primeWholeSpeechAudioForPhase:(phase,text)=>audio.push({phase,text}),maybeCompletePreparedAiConferral:()=>{},
        window:{ethicsApi:{ai:{generate:async request=>{calls.push(request);return generate(request);}}}}
    });
        rendererHarness.install(context,[
        "isFrenchLocale","l","caseLabel","judgeLabel","phaseSubtypeLabel","localeDirectiveForModels",
        "sanitizeText","getStoredText","otherRole","speakerName","isAiControlledRole","getParticipantModel",
        "getModelProvider","normalizeMatchModel","getPreparedAiTurnText","getAiTurnMaxOutputTokens","getAiBridge","requireProviderCredential","callAI",
        "getPhaseById","isSubstantiveTranscriptMessage","substantiveTranscriptAsPlainText",
        "buildAiDebaterSystemPrompt","buildAiScoringSystemPrompt","getJudgeQuestionPhaseId","getJudgeQuestionForAnswerPhase",
        "buildAiTurnPrompt","maybePrepareAiTurnForPhase"
    ]);
    return {context,state,calls,audio,values};
}
const phases = [
    {id:"present",kind:"speech",subtype:"presentation",caseNum:2,speaker:"ai",duration:300},
    {id:"comment",kind:"speech",subtype:"commentary",caseNum:2,speaker:"human",duration:180},
    {id:"respond",kind:"speech",subtype:"response",caseNum:2,speaker:"ai",duration:180},
    {id:"answer",kind:"judgeAnswer",caseNum:2,speaker:"ai",judgeNumber:1,duration:140}
];

test("all four phase types select an in-range complete answer without coaching or a retry",async()=>{
    for (const phase of phases) {
        const firstAnswer = Array(prompts.getWordTarget({duration:phase.duration}).target).fill("Answer").join(" ");
        const {context,state,calls,audio} = createRenderer(async()=>firstAnswer);
        state.askedJudgeQuestions.answer="Is this justified?";
        assert.equal(await context.maybePrepareAiTurnForPhase(phase),firstAnswer.trim());
        assert.equal(calls.length,1);
        assert.equal(state.aiPreparedTurns[phase.id].text,firstAnswer.trim());
        assert.equal(audio.length,1);
        assert.equal(audio[0].text,firstAnswer.trim());
        assert.equal(await context.maybePrepareAiTurnForPhase(phase),firstAnswer.trim());
        assert.equal(calls.length,1,"cache must not regenerate");
        assert.doesNotMatch(calls[0].systemPrompt,/charitable|philosoph|distinct individual|Do not mention|not a team|Additional model instructions/i);
        assert.ok(calls[0].userPrompt.includes(state.cases[2].text));
        assert.ok(calls[0].userPrompt.includes(state.cases[2].question));
        assert.doesNotMatch(calls[0].userPrompt,/\[EARLY\]|earlier discussion|\[EARLY END\]/,"exclude the other case's discussion");
        assert.ok(calls[0].userPrompt.includes(state.transcript[1].text));
        assert.doesNotMatch(calls[0].userPrompt,/I yield my time|word count|Length target|first sentence/i);
        assert.equal(calls[0].reasoningEffort,"medium");
        assert.equal(calls[0].maxTokens,25000+context.getAiTurnMaxOutputTokens(phase));
        assert.equal(calls[0].requestTimeoutMs,180000);
    }
});

test("concurrent preparation shares the bounded preparation including one fresh retry",async()=>{
    let release;
    const pending = new Promise(resolve=>{release=resolve;});
    const {context,calls} = createRenderer(()=>pending);
    const one=context.maybePrepareAiTurnForPhase(phases[0]);
    const two=context.maybePrepareAiTurnForPhase(phases[0]);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(calls.length,1);
    release("The first complete response.");
    assert.deepEqual(await Promise.all([one,two]),["The first complete response.","The first complete response."]);
    assert.equal(calls.length,2);
});

test("optional saved instructions survive preparation and apply only when nonempty",async()=>{
    for (const instruction of ["","Consider the uncertainty.\nUse a different example."]) {
        const {context,calls,values} = createRenderer(async()=>"First answer",instruction);
        await context.maybePrepareAiTurnForPhase(phases[0]);
        assert.equal(values.get("debate.instructions"),instruction);
        if (instruction) assert.ok(calls[0].systemPrompt.endsWith("Additional model instructions:\n"+instruction));
        else assert.doesNotMatch(calls[0].systemPrompt,/Additional model instructions/);
    }
});

test("final scoring uses the approved minimal instructions without participant guidance",async()=>{
    const {context,calls} = createRenderer(async()=>"Scorecard","Saved contestant instructions");
    await context.callAI({systemPrompt:context.buildAiScoringSystemPrompt(),userPrompt:"Score the completed match",reasoningEffort:"high"});
    assert.match(calls[0].systemPrompt,/judge scoring a completed live Ethics Bowl match independently/);
    assert.match(calls[0].systemPrompt,/two team-level written comments/);
    assert.doesNotMatch(calls[0].systemPrompt,/hardcodes|Saved contestant instructions|lowest band|55\/60|50\/60|calibration|material weakness/);
});
test("question binding and match cancellation discard stale answers before caching or audio",async()=>{
    const missing=createRenderer(async()=>"Never called");
    await assert.rejects(missing.context.maybePrepareAiTurnForPhase(phases[3]),/question is missing/);
    assert.equal(missing.calls.length,0);
    for (const change of ["question","run"]) {
        let release;
        const pending=new Promise(resolve=>{release=resolve;});
        const renderer=createRenderer(()=>pending);
        renderer.state.askedJudgeQuestions.answer="Original question?";
        const result=renderer.context.maybePrepareAiTurnForPhase(phases[3]);
        await new Promise(resolve=>setImmediate(resolve));
        if(change==="question")renderer.state.askedJudgeQuestions.answer="Changed question?";
        else renderer.state.matchRunId++;
        release("An answer to the original question.");
        if(change==="question")await assert.rejects(result,/question changed/);
        else assert.equal(await result,"");
        assert.equal(Object.keys(renderer.state.aiPreparedTurns).length,0);
        assert.equal(renderer.audio.length,0);
        assert.equal(Object.keys(renderer.state.aiPreparationPromises).length,0);
    }
});

test("technical incomplete-response retry retains identical prompts and returns only the complete answer",async()=>{
    for(const provider of ["openai","anthropic"]) {
        const bodies=[];
        const service=createProviderService({credentialStore:{get:async()=>"test-key"},sleep:async()=>{},fetchImpl:async(_url,options)=>{
            bodies.push(JSON.parse(options.body));
            return new Response(JSON.stringify(provider==="openai"
                ? bodies.length===1 ? {status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output_text:"Partial fragment"} : {status:"completed",output_text:"First complete answer"}
                : bodies.length===1 ? {stop_reason:"max_tokens",content:[{type:"text",text:"Partial fragment"}]} : {stop_reason:"end_turn",content:[{type:"text",text:"First complete answer"}]}),{status:200});
        }});
        const renderer=createRenderer(request=>service.generate({...request}));
        const phase={...phases[0],speaker:provider==="openai"?"human":"ai"};
        assert.equal(await renderer.context.maybePrepareAiTurnForPhase(phase),"First complete answer");
        assert.equal(renderer.calls.length,2,"content retry stays separate from technical transport recovery");
        assert.equal(bodies.length,3);
        assert.equal(bodies[0].max_output_tokens||bodies[0].max_tokens,29000);
        assert.equal(bodies[1].max_output_tokens||bodies[1].max_tokens,32768);
        for(const body of bodies)assert.equal(body.reasoning?.effort||body.output_config?.effort,"medium");
        if(provider==="openai"){
            assert.equal(bodies[0].input,bodies[1].input);assert.equal(bodies[0].instructions,bodies[1].instructions);
        }else assert.deepEqual(bodies[0].messages,bodies[1].messages);
        assert.equal(renderer.audio[0].text,"First complete answer");
    }
});

test("renderer still uses the existing bounded measured-duration audio timing",()=>{
    const minimum=Number(source.match(/const WHOLE_SPEECH_MIN_PLAYBACK_RATE = ([\d.]+);/)[1]);
    const maximum=Number(source.match(/const WHOLE_SPEECH_MAX_PLAYBACK_RATE = ([\d.]+);/)[1]);
    assert.equal(minimum,0.924);assert.equal(maximum,1.09);
    const short=planWholeSpeechPlayback({audioDurationSeconds:100,timerBudgetSeconds:300,minimumPlaybackRate:minimum,maximumPlaybackRate:maximum});
    const long=planWholeSpeechPlayback({audioDurationSeconds:400,timerBudgetSeconds:300,minimumPlaybackRate:minimum,maximumPlaybackRate:maximum});
    assert.equal(short.playbackRate,minimum);assert.equal(long.playbackRate,maximum);
});


test("all contestant phases use medium reasoning with both provider mappings",async()=>{
    for(const model of catalog.MATCH_MODELS)for(const phase of phases){
        const bodies=[];
        const service=createProviderService({credentialStore:{get:async()=>"test-key"},sleep:async()=>{},fetchImpl:async(_url,options)=>{
            bodies.push(JSON.parse(options.body));
            return new Response(JSON.stringify(model.provider==="openai"?{status:"completed",output_text:"Complete answer"}:{stop_reason:"end_turn",content:[{type:"text",text:"Complete answer"}]}),{status:200});
        }});
        const renderer=createRenderer(request=>service.generate({...request}));
        renderer.state.participantModels={human:model.id,ai:model.id};renderer.state.askedJudgeQuestions.answer="Is this justified?";
        assert.equal(await renderer.context.maybePrepareAiTurnForPhase(phase),"Complete answer");
        const effort="medium";
        assert.equal(renderer.calls[0].reasoningEffort,effort);
        assert.equal(bodies[0].reasoning?.effort||bodies[0].output_config?.effort,effort);
        assert.equal(bodies[0].max_tokens||bodies[0].max_output_tokens,25000+renderer.context.getAiTurnMaxOutputTokens(phase));
        if(model.provider==="anthropic")assert.deepEqual(bodies[0].thinking,{type:"adaptive",display:"omitted"});
    }
});

test("medium contestant recovery preserves effort, model, full prompts and total budget bound",async()=>{
    for(const model of ["gpt-6-astra","claude-fable-5-1"]){
        const bodies=[],openai=catalog.getProviderForModel(model)==="openai";
        const service=createProviderService({credentialStore:{get:async()=>"test-key"},sleep:async()=>{},fetchImpl:async(_url,options)=>{
            bodies.push(JSON.parse(options.body));const first=bodies.length===1;
            return new Response(JSON.stringify(openai?(first?{status:"incomplete",incomplete_details:{reason:"max_output_tokens"},output_text:"partial"}:{status:"completed",output_text:"Complete answer"}):(first?{stop_reason:"max_tokens",content:[{type:"text",text:"partial"}]}:{stop_reason:"end_turn",content:[{type:"text",text:"Complete answer"}]})),{status:200});
        }});
        const renderer=createRenderer(request=>service.generate({...request}));renderer.state.participantModels={human:model,ai:model};
        assert.equal(await renderer.context.maybePrepareAiTurnForPhase(phases[0]),"Complete answer");assert.equal(bodies.length,3);
        assert.equal(bodies[0].max_tokens||bodies[0].max_output_tokens,29000);assert.equal(bodies[1].max_tokens||bodies[1].max_output_tokens,32768);
        for(const body of bodies){assert.equal(body.model,model);assert.equal(body.reasoning?.effort||body.output_config?.effort,"medium");}
        if(openai){assert.equal(bodies[0].input,bodies[1].input);assert.equal(bodies[0].instructions,bodies[1].instructions);}else assert.deepEqual(bodies[0].messages,bodies[1].messages);
        assert.equal(renderer.audio[0].text,"Complete answer");
    }
});

test("each dispatched contestant request has one approved exact target in both languages without alternate length instructions",async()=>{
 const expected={en:[700,420,420,330],"fr-ca":[675,405,405,315]};
 for(const locale of ["en","fr-ca"])for(const [index,phase]of phases.entries())for(const model of ["gpt-6-astra","gpt-6-luna","claude-fable-5-1","claude-haiku-5-5"]){
  const bodies=[];const service=createProviderService({credentialStore:{get:async()=>"test-key"},fetchImpl:async(_url,options)=>{bodies.push(JSON.parse(options.body));return new Response(JSON.stringify(model.startsWith("gpt")?{status:"completed",output_text:"First complete answer."}:{stop_reason:"end_turn",content:[{type:"text",text:"First complete answer."}]}),{status:200});}});
  const {context,state,calls}=createRenderer(request=>service.generate(request));context.activeLocale=locale;state.participantModels={human:model,ai:model};state.askedJudgeQuestions.answer="Is this justified?";
  await context.maybePrepareAiTurnForPhase(phase);assert.equal(calls.length,2);assert.equal(bodies.length,2);
  const body=bodies[0],prompt=body.input||body.messages[0].content,system=body.instructions||body.system||"",target=expected[locale][index];
  assert.deepEqual(prompt.match(/Write exactly \d+ words\./g),[`Write exactly ${target} words.`]);assert.doesNotMatch(system,/Write exactly|words|length|padding|revision/i);assert.doesNotMatch(prompt,/between \d+|around \d+ words|word range|revise|rewrite/i);
  assert.equal(body.reasoning?.effort||body.output_config?.effort,"medium");
 }
});


test("public prepared-answer access rejects a changed judge question before playback",async()=>{
 const phase=phases[3],{context,state}=createRenderer(async()=>"Prepared answer.");state.phases=[phase];state.askedJudgeQuestions.answer="Original question?";
 await context.maybePrepareAiTurnForPhase(phase);assert.equal(context.getPreparedAiTurnText(phase.id),"Prepared answer.");
 state.askedJudgeQuestions.answer="Changed question?";assert.equal(context.getPreparedAiTurnText(phase.id),"");
});
