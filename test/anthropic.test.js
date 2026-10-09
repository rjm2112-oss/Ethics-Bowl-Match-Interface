"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    ANTHROPIC_VERSION,
    MESSAGES_URL,
    createAnthropicAdapter
} = require("../src/main/providers/anthropic");

function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { "content-type": "application/json", ...(init.headers || {}) }
    });
}

function request(overrides = {}) {
    return {
        model: "claude-sonnet-5-5",
        systemPrompt: "Follow the match rules.",
        userPrompt: "Make an argument.",
        maxTokens: 900,
        reasoningEffort: "high",
        jsonSchema: null,
        ...overrides
    };
}

test("Anthropic Messages uses top-level system, user content, version header, effort, and text extraction", async () => {
    let captured;
    const adapter = createAnthropicAdapter({
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "Claude's argument." }] });
        },
        sleep: async () => {}
    });

    assert.equal(await adapter.generate(request(), "anthropic-test-value"), "Claude's argument.");
    assert.equal(captured.url, MESSAGES_URL);
    assert.equal(captured.options.headers["x-api-key"], "anthropic-test-value");
    assert.equal(captured.options.headers["anthropic-version"], ANTHROPIC_VERSION);
    assert.deepEqual(JSON.parse(captured.options.body), {
        model: "claude-sonnet-5-5",
        messages: [{ role: "user", content: "Make an argument." }],
        max_tokens: 900,
        system: "Follow the match rules.",
        output_config: { effort: "high" },
        thinking: {type:"adaptive",display:"omitted"}
    });
});

test("Anthropic structured output sends output_config.format and parses JSON text", async () => {
    let body;
    const adapter = createAnthropicAdapter({
        fetchImpl: async (_url, options) => {
            body = JSON.parse(options.body);
            return jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: '{"winner":"one"}' }] });
        },
        sleep: async () => {}
    });
    const jsonSchema = {
        name: "result",
        strict: true,
        schema: { type: "object", properties: { winner: { type: "string" } }, required: ["winner"] }
    };

    assert.deepEqual(await adapter.generate(request({ jsonSchema }), "anthropic-test-value"), { winner: "one" });
    assert.deepEqual(body.output_config, {
        effort: "high",
        format: { type: "json_schema", schema: jsonSchema.schema }
    });
});

test("Anthropic retries rate limits and server failures", async () => {
    let call = 0;
    const delays = [];
    const adapter = createAnthropicAdapter({
        fetchImpl: async () => {
            call += 1;
            if (call === 1) return jsonResponse({ error: { message: "limited" } }, { status: 429, headers: { "retry-after": "0" } });
            if (call === 2) return jsonResponse({ error: { message: "busy" } }, { status: 500 });
            return jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "Ready." }] });
        },
        sleep: async (delay) => delays.push(delay)
    });

    assert.equal(await adapter.generate(request(), "anthropic-test-value"), "Ready.");
    assert.equal(call, 3);
    assert.deepEqual(delays, [0, 700]);
});

test("Anthropic surfaces refusal and output-limit stop reasons clearly", async () => {
    const refusal = createAnthropicAdapter({
        fetchImpl: async () => jsonResponse({ stop_reason: "refusal", content: [] }),
        sleep: async () => {}
    });
    await assert.rejects(refusal.generate(request(), "anthropic-test-value"), /refused this request/);

    const limited = createAnthropicAdapter({
        fetchImpl: async () => jsonResponse({ stop_reason: "max_tokens", content: [{ type: "text", text: "partial" }] }),
        sleep: async () => {}
    });
    await assert.rejects(limited.generate(request(), "anthropic-test-value"), /output-token budget/);
});

test("Anthropic retries one output-budget failure with more tokens and unchanged effort", async () => {
    const bodies = [];
    const adapter = createAnthropicAdapter({
        fetchImpl: async (_url, options) => {
            bodies.push(JSON.parse(options.body));
            if (bodies.length === 1) return jsonResponse({ stop_reason: "max_tokens", content: [] });
            return jsonResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "Recovered." }] });
        },
        sleep: async () => {}
    });

    assert.equal(await adapter.generate(request({ maxTokens: 1200 }), "anthropic-test-value"), "Recovered.");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].max_tokens, 2400);
    assert.equal(bodies[1].output_config.effort, "high");
});

test("Anthropic generation honors a per-request timeout", async () => {
    const adapter = createAnthropicAdapter({
        fetchImpl: async (_url, options) => new Promise((_, reject) => {
            options.signal.addEventListener("abort", () => {
                const error = new Error("aborted");
                error.name = "AbortError";
                reject(error);
            }, { once: true });
        }),
        sleep: async () => {},
        requestTimeoutMs: 1000
    });

    await assert.rejects(adapter.generate(request({ requestTimeoutMs: 5 }), "anthropic-test-value"), /timed out/);
});

test("Anthropic rejects partial text for context exhaustion and every unfinished stop reason", async () => {
    for (const stop_reason of ["model_context_window_exceeded", "pause_turn", "tool_use", "stop_sequence", "unknown", null]) {
        let calls = 0;
        const adapter = createAnthropicAdapter({fetchImpl: async () => {calls++;return jsonResponse({stop_reason,content:[{type:"text",text:'{"score":42}'}]});},sleep:async()=>{}});
        for(const jsonSchema of [null,{name:"score",schema:{type:"object"}}]) await assert.rejects(adapter.generate(request({jsonSchema}),"test-key"),/Partial text was not accepted/);
        assert.equal(calls,2,"unfinished context/tool turns must not trigger an automatic substantive continuation");
    }
});

test("Anthropic does not repeat an exhausted maximum output budget", async () => {
    let calls=0;const adapter=createAnthropicAdapter({fetchImpl:async()=>{calls++;return jsonResponse({stop_reason:"max_tokens",content:[{type:"text",text:"partial"}]});},sleep:async()=>{}});
    await assert.rejects(adapter.generate(request({maxTokens:32768}),"test-key"),/output-token budget/);assert.equal(calls,1);
});

test("Anthropic encodes official bounded integer scores as identical numeric enums without mutating the shared schema",async()=>{
 const {encodeBoundedIntegers}=require('../src/main/providers/anthropic');
 const ranges=require('../src/shared/scorecard-tally').OFFICIAL_BREAKDOWN_RANGES;
 const properties=Object.fromEntries(Object.entries(ranges).map(([key,[minimum,maximum]])=>[key,{type:'integer',minimum,maximum}]));
 const schema={type:'object',additionalProperties:false,required:['participantOne','participantTwo','comment'],properties:{
  participantOne:{type:'object',additionalProperties:false,required:Object.keys(properties),properties},
  participantTwo:{type:'object',additionalProperties:false,required:Object.keys(properties),properties},comment:{type:'string'}
 }};
 const original=JSON.stringify(schema);let body;
 const adapter=createAnthropicAdapter({fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return jsonResponse({stop_reason:'end_turn',content:[{type:'text',text:'{"comment":"ok"}'}]});},sleep:async()=>{}});
 await adapter.generate(request({jsonSchema:{name:'final_judge_scorecard',schema}}),'test-key');
 assert.equal(JSON.stringify(schema),original);assert.equal(body.output_config.effort,'high');
 for(const participant of ['participantOne','participantTwo'])for(const [key,[min,max]] of Object.entries(ranges)){
  const field=body.output_config.format.schema.properties[participant].properties[key];
  assert.equal(field.type,'integer');assert.equal(field.minimum,undefined);assert.equal(field.maximum,undefined);
  assert.deepEqual(field.enum,Array.from({length:max-min+1},(_,i)=>min+i));
 }
 assert.deepEqual(encodeBoundedIntegers({type:'integer',minimum:0,maximum:5,enum:[2,3,9]}),{type:'integer',enum:[2,3]});
 assert.deepEqual(body.output_config.format.schema.required,schema.required);
});


test("Anthropic unsupported-schema HTTP 400 is returned after one transport attempt",async()=>{
 let calls=0,sleeps=0;const adapter=createAnthropicAdapter({fetchImpl:async()=>{calls++;return jsonResponse({error:{message:"Schema minimum is unsupported"}},{status:400});},sleep:async()=>{sleeps++;}});
 await assert.rejects(adapter.generate(request({jsonSchema:require("../src/shared/final-scoring").schema}),"test-key"),/HTTP 400.*unsupported/);assert.equal(calls,1);assert.equal(sleeps,0);
});
test("provider schema mapping leaves strict application score validation intact",async()=>{
 const scoring=require("../src/shared/final-scoring"),ranges=require("../src/shared/scorecard-tally").OFFICIAL_BREAKDOWN_RANGES;
 const full=Object.fromEntries(Object.entries(ranges).map(([key,[,max]])=>[key,max]));
 for(const value of [5.5,-1,6,"5"]){const raw={participantOne:{...full,presentationQuestion:value,didWell:"One strengths.",needsImprovement:"One improvement."},participantTwo:{...full,didWell:"Two strengths.",needsImprovement:"Two improvement."}};const adapter=createAnthropicAdapter({fetchImpl:async()=>jsonResponse({stop_reason:"end_turn",content:[{type:"text",text:JSON.stringify(raw)}]}),sleep:async()=>{}});const parsed=await adapter.generate(request({jsonSchema:scoring.schema}),"test-key");assert.throws(()=>scoring.normalize(parsed,1));}
});
