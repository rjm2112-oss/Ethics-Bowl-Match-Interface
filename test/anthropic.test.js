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
        model: "claude-sonnet-5",
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
        model: "claude-sonnet-5",
        messages: [{ role: "user", content: "Make an argument." }],
        max_tokens: 900,
        system: "Follow the match rules.",
        output_config: { effort: "high" }
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
    await assert.rejects(limited.generate(request(), "anthropic-test-value"), /output-token limit/);
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
