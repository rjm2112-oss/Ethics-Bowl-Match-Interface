'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createProviderService} = require('../src/main/provider-service');
const catalog = require('../src/shared/model-catalog');

test('every current model reaches the correct provider endpoint using mocked transport', async () => {
    const calls = [], keys = [];
    const service = createProviderService({
        credentialStore: {get: async provider => {keys.push(provider);return 'test-key';}},
        fetchImpl: async (url, options) => {
            calls.push({url, body:JSON.parse(options.body), headers:options.headers});
            return new Response(JSON.stringify(url.includes('anthropic') ? {content:[{type:'text',text:'A thoughtful answer.'}],stop_reason:'end_turn'} : {status:'completed',output_text:'A thoughtful answer.'}), {status:200});
        },
        sleep: async () => {}
    });
    for (const model of catalog.MATCH_MODELS) {
        assert.equal(await service.generate({model:model.id,userPrompt:'Debate.',reasoningEffort:'high'}),'A thoughtful answer.');
        const call = calls.at(-1);
        assert.equal(call.url, model.provider === 'openai' ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages');
        assert.equal(keys.at(-1), model.provider);
        assert.equal(call.body.model, model.id);
        assert.equal(call.body.max_output_tokens||call.body.max_tokens,25800);
        if(model.provider === 'anthropic'){assert.equal(call.body.output_config.effort,'high');assert.deepEqual(call.body.thinking,{type:'adaptive',display:'omitted'});assert.equal(call.body.thinking.budget_tokens,undefined);}
        else assert.equal(call.body.reasoning.effort,'high');
    }
    const before = calls.length;
    for (const model of ['gpt-5.6-sol','claude-sonnet-5']) await assert.rejects(service.generate({model,userPrompt:'No.'}), /not supported/);
    assert.equal(calls.length,before);
});
