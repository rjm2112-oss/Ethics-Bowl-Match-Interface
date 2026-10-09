"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    RESPONSES_URL,
    SPEECH_URL,
    TRANSCRIPTIONS_URL,
    createOpenAiAdapter
} = require("../src/main/providers/openai");

function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { "content-type": "application/json", ...(init.headers || {}) }
    });
}

function textRequest(overrides = {}) {
    return {
        model: "gpt-6-astra",
        systemPrompt: "Follow the match rules.",
        userPrompt: "Make an argument.",
        maxTokens: 800,
        reasoningEffort: "high",
        jsonSchema: null,
        ...overrides
    };
}

test("OpenAI Responses uses instructions, reasoning, and extracts text", async () => {
    let captured;
    const adapter = createOpenAiAdapter({
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return jsonResponse({ status: "completed", output: [{ content: [{ type: "output_text", text: "A clear response." }] }] });
        },
        sleep: async () => {}
    });

    assert.equal(await adapter.generate(textRequest(), "openai-test-value"), "A clear response.");
    assert.equal(captured.url, RESPONSES_URL);
    assert.equal(captured.options.headers.Authorization, "Bearer openai-test-value");
    assert.deepEqual(JSON.parse(captured.options.body), {
        model: "gpt-6-astra",
        input: "Make an argument.",
        max_output_tokens: 800,
        instructions: "Follow the match rules.",
        reasoning: { effort: "high" }
    });
});

test("OpenAI Responses parses structured JSON and preserves the requested schema", async () => {
    let body;
    const adapter = createOpenAiAdapter({
        fetchImpl: async (_url, options) => {
            body = JSON.parse(options.body);
            return jsonResponse({ status: "completed", output_text: '{"score":42}' });
        },
        sleep: async () => {}
    });
    const jsonSchema = {
        name: "scorecard",
        strict: true,
        schema: { type: "object", properties: { score: { type: "integer" } }, required: ["score"] }
    };

    assert.deepEqual(await adapter.generate(textRequest({ jsonSchema }), "openai-test-value"), { score: 42 });
    assert.deepEqual(body.text.format, { type: "json_schema", ...jsonSchema });
});

test("OpenAI Responses retries transient statuses and replaces a partial output-budget response without changing effort", async () => {
    const bodies = [];
    const delays = [];
    let call = 0;
    const adapter = createOpenAiAdapter({
        fetchImpl: async (_url, options) => {
            call += 1;
            bodies.push(JSON.parse(options.body));
            if (call === 1) return jsonResponse({ error: { message: "busy" } }, { status: 429, headers: { "retry-after": "0" } });
            if (call === 2) return jsonResponse({
                status: "incomplete",
                incomplete_details: { reason: "max_output_tokens" },
                output_text: "This fragment must not be returned"
            });
            return jsonResponse({ status: "completed", output_text: "Recovered." });
        },
        sleep: async (delay) => delays.push(delay)
    });

    assert.equal(await adapter.generate(textRequest(), "openai-test-value"), "Recovered.");
    assert.equal(call, 3);
    assert.deepEqual(delays, [0]);
    assert.equal(bodies[2].max_output_tokens, 2000);
    assert.deepEqual(bodies[2].reasoning, { effort: "high" });
});

test("OpenAI Responses rejects a second incomplete response instead of exposing partial text", async () => {
    const adapter = createOpenAiAdapter({
        fetchImpl: async () => jsonResponse({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output_text: "Still unfinished"
        }),
        sleep: async () => {}
    });

    await assert.rejects(
        adapter.generate(textRequest(), "openai-test-value"),
        /before completing the response/
    );
});

test("OpenAI speech sends supported voice instructions, retries, and returns typed bytes", async () => {
    const calls = [];
    const adapter = createOpenAiAdapter({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (calls.length === 1) return jsonResponse({ error: { message: "temporary" } }, { status: 503 });
            return new Response(Uint8Array.from([10, 20, 30]), { status: 200, headers: { "content-type": "audio/mpeg" } });
        },
        sleep: async () => {}
    });

    const result = await adapter.speech({
        model: "gpt-4o-mini-tts",
        voice: "sage",
        input: "Read this.",
        responseFormat: "mp3",
        instructions: "Use a natural, measured cadence."
    }, "openai-test-value");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, SPEECH_URL);
    assert.deepEqual(JSON.parse(calls[1].options.body), {
        model: "gpt-4o-mini-tts",
        voice: "sage",
        input: "Read this.",
        response_format: "mp3",
        instructions: "Use a natural, measured cadence."
    });
    assert.ok(result.bytes instanceof Uint8Array);
    assert.deepEqual([...result.bytes], [10, 20, 30]);
    assert.equal(result.mimeType, "audio/mpeg");
});

test("OpenAI speech retries an interrupted audio download without changing the request", async () => {
    const calls = [];
    const delays = [];
    const adapter = createOpenAiAdapter({
        fetchImpl: async (url, options) => {
            calls.push({ url, options });
            if (calls.length === 1) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({ "content-type": "audio/mpeg" }),
                    arrayBuffer: async () => { throw new TypeError("terminated"); }
                };
            }
            return new Response(Uint8Array.from([40, 50, 60]), {
                status: 200,
                headers: { "content-type": "audio/mpeg" }
            });
        },
        sleep: async (delay) => delays.push(delay)
    });
    const request = {
        model: "gpt-4o-mini-tts",
        voice: "sage",
        input: "Retry only this chunk.",
        responseFormat: "mp3",
        instructions: "Use a natural, measured cadence."
    };

    const result = await adapter.speech(request, "openai-test-value");

    assert.equal(calls.length, 2);
    assert.deepEqual(delays, [350]);
    assert.equal(calls[0].url, SPEECH_URL);
    assert.equal(calls[1].url, SPEECH_URL);
    assert.equal(calls[1].options.body, calls[0].options.body);
    assert.deepEqual([...result.bytes], [40, 50, 60]);
});

test("OpenAI speech retries one timed-out request", async () => {
    let callCount = 0;
    const delays = [];
    const adapter = createOpenAiAdapter({
        fetchImpl: async (_url, options) => {
            callCount += 1;
            if (callCount === 1) {
                return new Promise((_, reject) => {
                    options.signal.addEventListener("abort", () => {
                        const error = new Error("aborted");
                        error.name = "AbortError";
                        reject(error);
                    }, { once: true });
                });
            }
            return new Response(Uint8Array.from([70, 80, 90]), {
                status: 200,
                headers: { "content-type": "audio/mpeg" }
            });
        },
        sleep: async (delay) => delays.push(delay),
        requestTimeoutMs: 5
    });

    const result = await adapter.speech({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: "Retry this timed-out speech chunk.",
        responseFormat: "mp3"
    }, "openai-test-value");

    assert.equal(callCount, 2);
    assert.deepEqual(delays, [350]);
    assert.deepEqual([...result.bytes], [70, 80, 90]);
});

test("OpenAI speech bounds retries when every audio download is interrupted", async () => {
    let callCount = 0;
    const delays = [];
    const adapter = createOpenAiAdapter({
        fetchImpl: async () => {
            callCount += 1;
            return {
                ok: true,
                status: 200,
                headers: new Headers({ "content-type": "audio/mpeg" }),
                arrayBuffer: async () => { throw new TypeError("terminated"); }
            };
        },
        sleep: async (delay) => delays.push(delay)
    });

    await assert.rejects(adapter.speech({
        model: "gpt-4o-mini-tts",
        voice: "sage",
        input: "This download keeps ending early.",
        responseFormat: "mp3"
    }, "openai-test-value"), /response was interrupted/);

    assert.equal(callCount, 3);
    assert.deepEqual(delays, [350, 700]);
});

test("OpenAI transcription sends native multipart data with the final transcription model", async () => {
    let captured;
    const adapter = createOpenAiAdapter({
        fetchImpl: async (url, options) => {
            captured = { url, options };
            return jsonResponse({ text: "  Recorded argument.  " });
        },
        sleep: async () => {}
    });
    const result = await adapter.transcribe({
        model: "gpt-transcribe",
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/webm",
        fileName: "preview.webm",
        language: "en",
        prompt: "Ethics Bowl"
    }, "openai-test-value");

    assert.deepEqual(result, { text: "Recorded argument." });
    assert.equal(captured.url, TRANSCRIPTIONS_URL);
    assert.equal(captured.options.headers.Authorization, "Bearer openai-test-value");
    assert.equal(captured.options.body.get("model"), "gpt-transcribe");
    assert.equal(captured.options.body.get("languages[]"), "en");
    assert.equal(captured.options.body.get("prompt"), "Ethics Bowl");
    assert.equal(captured.options.body.get("file").name, "preview.webm");
});

test("OpenAI requests fail clearly when the provider stalls", async () => {
    const adapter = createOpenAiAdapter({
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

    await assert.rejects(adapter.generate(textRequest({ requestTimeoutMs: 5 }), "openai-test-value"), /timed out/);
});

test("OpenAI accepts only completed responses, never partial text or JSON from another status",async()=>{
 for(const status of ["incomplete","failed","cancelled","in_progress","queued","unexpected",undefined]){
  let calls=0;const adapter=createOpenAiAdapter({fetchImpl:async()=>{calls++;return jsonResponse({status,incomplete_details:status==="incomplete"?{reason:"content_filter"}:undefined,output_text:'{"score":42}'});},sleep:async()=>{}});
  for(const jsonSchema of [null,{name:"score",schema:{type:"object"}}])await assert.rejects(adapter.generate(textRequest({jsonSchema}),"test-key"),/Partial text was not accepted/);
  assert.equal(calls,2);
 }
});

test("OpenAI does not retry cancelled/failed results or an already maximal output budget",async()=>{
 for(const status of ["cancelled","failed","incomplete"]){let calls=0;const adapter=createOpenAiAdapter({fetchImpl:async()=>{calls++;return jsonResponse({status,incomplete_details:{reason:"max_output_tokens"},output_text:"partial"});},sleep:async()=>{}});await assert.rejects(adapter.generate(textRequest({maxTokens:32768}),"test-key"),/output-token budget/);assert.equal(calls,1);}
});

test('OpenAI completed refusals are surfaced as failures',async()=>{
 const adapter=createOpenAiAdapter({fetchImpl:async()=>jsonResponse({status:'completed',output:[{content:[{type:'refusal',refusal:'Unable to comply'}]}]}),sleep:async()=>{}});await assert.rejects(adapter.generate(textRequest(),'test-key'),/refused this request/);
});
