const rendererHarness=require("./helpers/renderer-harness");
const declaration=rendererHarness.declaration;
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const catalog = require("../src/shared/model-catalog");
const {createProviderService} = require("../src/main/provider-service");
const source = rendererHarness.source();


test("four flagship panels assign exact models to each judge and reject invalid judge numbers",()=>{
    assert.deepEqual(catalog.JUDGE_PANELS.map(panel=>panel.models),[
        ["gpt-6-astra","gpt-6-astra","gpt-6-astra"],
        ["claude-fable-5-1","claude-fable-5-1","claude-fable-5-1"],
        ["gpt-6-astra","gpt-6-astra","claude-fable-5-1"],
        ["claude-fable-5-1","claude-fable-5-1","gpt-6-astra"]
    ]);
    for(const panel of catalog.JUDGE_PANELS)for(const number of [1,2,3])assert.equal(catalog.getJudgeModelForPanel(panel.id,number),panel.models[number-1]);
    assert.equal(catalog.normalizeJudgePanel("retired"),"all-gpt");
    for(const invalid of [0,4,1.5,"1"])assert.throws(()=>catalog.getJudgeModelForPanel("all-gpt",invalid),/Judge number/);
});

test("each judge's question and scorecard use its selected model and existing prompt/schema",async()=>{
    for(const panel of catalog.JUDGE_PANELS){
        const requests=[];
        const state={judgePanelPreset:panel.id,judgeMode:"ai",matchRunId:1,judgeQuestionCache:{1:[],2:[]},aiFinalJudgeScorecards:{},aiFinalJudgeScoringPromises:{},aiFinalJudgeScoringErrors:{}};
        const schema={existingSchema:true};
        const context=vm.createContext({
            state,MODEL_CATALOG:catalog,JUDGE_REASONING_EFFORT:catalog.REASONING_POLICIES.judge,FINAL_SCORECARD_REQUEST_TIMEOUT_MS:1234,FINAL_JUDGE_SCORECARD_JSON_SCHEMA:schema,
            buildAiJudgeQuestionPrompt:()=>"Approved question prompt", extractJsonObject:raw=>JSON.parse(raw),
            cacheAiJudgeQuestion:()=>"An approved question?",getCachedAiJudgeQuestion:()=>"",
            publishJudgeScorecard:()=>{}, scoringTranscriptAsPlainText:()=>"Full scoring transcript",buildAiSingleJudgeScoringPrompt:text=>"Existing scoring prompt: "+text,buildAiScoringSystemPrompt:()=>"Existing scoring system",
            normalizeAiFinalJudgeScorecardResponse:(raw,number)=>({judgeNumber:number,raw}),sanitizeText:value=>String(value).trim(),
            callAI:async request=>{requests.push(request);return request.jsonSchema?{existingScore:true}:JSON.stringify({question:"An approved question?"});}
        });
        rendererHarness.install(context,["getJudgeModel","usesAiFinalScoring","ensureAiJudgeQuestion","maybePrepareAiFinalJudgeScorecard"]);
        for(const number of [1,2,3]){
            await context.ensureAiJudgeQuestion(1,number);
            const card=await context.maybePrepareAiFinalJudgeScorecard(number);
            assert.equal(card.judgeNumber,number);assert.equal(card.raw.existingScore,true);
            const [question,score]=requests.slice(-2);
            for(const request of [question,score]){assert.equal(request.model,panel.models[number-1]);assert.equal(request.reasoningEffort,"high");}
            assert.equal(question.userPrompt,"Approved question prompt");assert.equal(question.systemPrompt,"");assert.equal(question.role,undefined);
            assert.equal(score.userPrompt,"Existing scoring prompt: Full scoring transcript");assert.equal(score.systemPrompt,"Existing scoring system");
            assert.equal(score.role,undefined);assert.equal(score.jsonSchema,schema);assert.equal(score.maxTokens,6000);assert.equal(score.requestTimeoutMs,1234);
            const count=requests.length;await context.maybePrepareAiFinalJudgeScorecard(number);assert.equal(requests.length,count);
        }
    }
});

test("all panel models route final structured scoring through the correct mocked provider transport",async()=>{
    const calls=[];
    const service=createProviderService({credentialStore:{get:async()=>"test-key"},sleep:async()=>{},fetchImpl:async(url,options)=>{
        const body=JSON.parse(options.body);calls.push({url,body});
        const text=JSON.stringify({comment:"Existing rubric score"});
        return new Response(JSON.stringify(url.includes("anthropic")?{content:[{type:"text",text}],stop_reason:"end_turn"}:{status:"completed",output_text:text}),{status:200});
    }});
    const schema={name:"judge",schema:{type:"object",properties:{comment:{type:"string"}},required:["comment"],additionalProperties:false}};
    for(const panel of catalog.JUDGE_PANELS)for(const number of [1,2,3]){
        const model=catalog.getJudgeModelForPanel(panel.id,number);
        assert.deepEqual(await service.generate({model,userPrompt:"Score the same full match.",systemPrompt:"Existing scoring rules.",reasoningEffort:"high",maxTokens:6000,jsonSchema:schema}),{comment:"Existing rubric score"});
        const call=calls.at(-1),anthropic=catalog.getProviderForModel(model)==="anthropic";
        assert.equal(call.url,anthropic?"https://api.anthropic.com/v1/messages":"https://api.openai.com/v1/responses");
        assert.equal(call.body.model,model);assert.equal(call.body.max_tokens||call.body.max_output_tokens,31000);
        if(anthropic)assert.deepEqual(call.body.thinking,{type:"adaptive",display:"omitted"});
        if(anthropic)assert.equal(call.body.output_config.effort,"high");else assert.equal(call.body.reasoning.effort,"high");
    }
});
