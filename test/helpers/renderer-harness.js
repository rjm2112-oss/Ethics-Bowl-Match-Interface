"use strict";
const fs=require("node:fs"),path=require("node:path");
const catalog=require("../../src/shared/model-catalog");
const moduleNames=["locale","credentials","setup","transcript","speech","speech-view","speech-callbacks","timing","model-client","context","prompts","turns","questions","scoring","score-format","scorecards","composer","pending-submission","voice","match","phase-access","coin-choice","timer"];
const modules=moduleNames.map(name=>require("../../src/renderer/"+name));
const shared={EthicsModelCatalog:catalog,EthicsAiTurnPrompts:require("../../src/shared/ai-turn-prompt"),EthicsBowlRubric:require("../../src/shared/ethics-bowl-rubric"),EthicsFinalScoring:require("../../src/shared/final-scoring"),EthicsMatchPhases:require("../../src/shared/match-phases"),EthicsTranscriptContext:require("../../src/shared/transcript-context"),EthicsAudioPcm:require("../../src/shared/audio-pcm"),EthicsCasePacket:require("../../src/shared/case-packet")};
const defaults={MODEL_CATALOG:catalog,AI_TURN_PROMPTS:shared.EthicsAiTurnPrompts,ETHICS_BOWL_RUBRIC:shared.EthicsBowlRubric,SCORECARD_TALLY:require("../../src/shared/scorecard-tally"),SPEECH_DELIVERY:require("../../src/shared/speech-delivery"),PHASE_TIMER_POLICY:require("../../src/shared/phase-timer-policy"),SPEECH_TIMING:require("../../src/shared/speech-timing"),COMPOSER_STATUS:require("../../src/shared/composer-status"),DEFAULT_JUDGE_MODEL:catalog.DEFAULT_JUDGE_MODEL,DEFAULT_PARTICIPANT_MODEL:catalog.DEFAULT_PARTICIPANT_MODEL,JUDGE_REASONING_EFFORT:"high",TIMINGS:shared.EthicsMatchPhases.TIMINGS,TIMING_TEST_MODE:false,FINAL_SCORECARD_REQUEST_TIMEOUT_MS:240000,FINAL_JUDGE_SCORECARD_JSON_SCHEMA:shared.EthicsFinalScoring.schema,STORAGE_KEYS:{instructions:"debate.instructions"},MAX_TTS_CHARS:4096,SPEECH_CHUNK_MAX:800,STOP_SPEECH_ERROR:"__speech_stopped__"};
function install(globals,names) {
    const supplied={...(globals.state||{})};globals.state=Object.assign(globals.state||{},require("../../src/shared/match-session").create({locale:globals.activeLocale||"en",modelCatalog:catalog}),supplied);const state=globals.state;
    state.locale=globals.activeLocale||state.locale||"en";state.phases=state.phases||[];state.aiFinalJudgeScoringTranscripts=state.aiFinalJudgeScoringTranscripts||{};
    if(Object.hasOwn(globals,"activeLocale"))Object.defineProperty(globals,"activeLocale",{configurable:true,get:()=>state.locale,set:value=>{state.locale=value;}});
    const window=Object.assign({setTimeout,clearTimeout,setInterval,clearInterval,...shared},globals.window||{});
    const proxy=values=>new Proxy(values,{get:(target,key)=>Object.hasOwn(globals,key)?globals[key]:target[key],set:(_target,key,value)=>{globals[key]=value;return true;}});
    const context={state,ui:proxy({}),settings:proxy(defaults),platform:proxy({window,document:{},localStorage:{getItem:()=>""},console,URL,Blob,AbortController,performance}),services:{}};
    // Window combines the real shared APIs with each test's mocked IPC boundary.
    context.platform.window=window;
    const methods=Object.assign({},...modules.map(module=>module.create(context)));
    Object.assign(context.services,methods,Object.fromEntries(Object.entries(globals).filter(([,value])=>typeof value==="function")));
    for(const name of names){if(typeof methods[name]!=="function")throw Error("Unknown renderer method: "+name);context.services[name]=methods[name];globals[name]=methods[name];}
    return globals;
}
function load(names,globals={}){return install({...globals},names);}
function declaration(name){const c=load([name]);return c[name].toString();}
function source(){return ["debater.js",...moduleNames.map(name=>"src/renderer/"+name+".js")].map(file=>fs.readFileSync(path.join(__dirname,"../..",file),"utf8")).join("\n");}
module.exports={install,load,declaration,source};
