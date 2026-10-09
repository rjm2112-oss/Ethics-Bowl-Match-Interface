"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const harness=require("./helpers/renderer-harness"),delivery=require("../src/shared/speech-delivery");
const phasesApi=require("../src/shared/match-phases"),contexts=require("../src/shared/transcript-context");
const fresh=request=>Array(request.recordContext.wordTarget).fill("Selected").join(" ");
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

function fixture({locale="en",caseNum=1,subtype="presentation",stateOfPrediction="complete",generate,beforeSpeech=false}={}) {
    const calls=[],audio=[],cleared=[],spoken=[];
    const phases=phasesApi.build({leadByCase:{1:"human",2:"ai"},locale});
    const source=phases.find(p=>p.id===`case${caseNum}-${subtype}`),target=phases.find(p=>p.id===`case${caseNum}-${subtype==="presentation"?"commentary":"response"}`);
    const current=beforeSpeech?phases.find(p=>p.id===source.id+"-confer"):source;
    const state={started:true,matchRunId:3,phaseReady:true,locale,phases,currentPhaseIndex:phases.indexOf(current),
        names:{human:"Alex",ai:"Morgan"},participantTypes:{human:"ai",ai:"ai"},leadByCase:{1:"human",2:"ai"},
        cases:{1:{title:"First",text:"First case narrative.",question:"Should we?"},2:{title:"Second",text:"Second case narrative.",question:"Why?"}},
        transcript:[{kind:"ai",label:"Other",caseNum:caseNum===1?2:1,text:"OTHER_CASE_PRIVATE_DISCUSSION",speechDeliveryState:"complete"}]};
    const generated="Generated draft text and an unplayed conclusion.",recognized=locale==="en"?"Actual recognized argument.":"Argument réellement reconnu.";
    const message={kind:source.speaker==="human"?"ai-alt":"ai",label:state.names[source.speaker],caseNum,phaseId:source.id};
    delivery.attach(message,generated,[generated]);
    if(!beforeSpeech)state.transcript.push(message);
    const c=harness.load(["primeAiPreparationForPhase","maybePrepareAiTurnForPhase","getPreparedAiTurnText","getAiPreparationBindingStatus","generateAiTurnForPhase"],{
        state,activeLocale:locale,localStorage:{getItem:()=>""},
        callAI:request=>{calls.push(request);return generate?generate(request):Promise.resolve(fresh(request));},
        primeWholeSpeechAudioForPhase:(phase,text)=>audio.push({phaseId:phase.id,text}),maybeCompletePreparedAiConferral(){},
        clearWholeSpeechPreparation:phaseId=>{cleared.push(phaseId);state.wholeSpeechPreparations.delete(phaseId);state.speechContextPredictions.delete(phaseId);},
        appendParticipantMessage:(...args)=>spoken.push(args),setBusy(){},setStatus(){},refreshControls(){},updateComposerModeIndicator(){},console:{error(){}}
    });
    const prediction={matchRunId:state.matchRunId,sourceText:generated,kind:message.kind,text:recognized,deliveryState:stateOfPrediction};
    state.speechContextPredictions.set(source.id,prediction);
    const finish=(text=recognized,status=stateOfPrediction)=>{
        if(!state.transcript.includes(message))state.transcript.push(message);
        if(status==="complete"){delivery.registerSpokenTranscript(message,0,{transcriptText:text});delivery.completeChunk(message,0);}
        else{delivery.beginSpokenCutoff(message);delivery.finalizeSpokenCutoff(message,text);}
    };
    const settle=async()=>{await Promise.all(Object.values(state.aiPreparationPromises));await new Promise(setImmediate);};
    const enterTarget=()=>{state.currentPhaseIndex=phases.indexOf(target);state.phaseReady=true;};
    return {c,state,source,target,current,calls,audio,cleared,spoken,message,prediction,generated,recognized,finish,settle,enterTarget};
}

for(const locale of ["en","fr-ca"])for(const caseNum of [1,2])for(const subtype of ["presentation","commentary"])for(const predicted of ["complete","cutoff"]) {
    test(`${locale} case ${caseNum} ${subtype}: ${predicted} prediction prepares early and waits for the speaker to finish`,async()=>{
        const f=fixture({locale,caseNum,subtype,stateOfPrediction:predicted});
        f.c.primeAiPreparationForPhase(f.current);f.c.primeAiPreparationForPhase(f.current);
        await f.settle();
        assert.equal(f.calls.length,1);assert.equal(f.calls[0].recordContext.phaseId,f.target.id);
        assert.ok(f.calls[0].userPrompt.includes(f.recognized));assert.doesNotMatch(f.calls[0].userPrompt,/Generated draft|unplayed conclusion|OTHER_CASE/);
        assert.equal(f.message.text,"");assert.equal(f.message.speechDeliveryState,"pending");assert.equal(f.spoken.length,0);
        assert.throws(()=>contexts.discussion({messages:f.state.transcript,phases:f.state.phases}),/verified/);
        assert.equal(f.c.getPreparedAiTurnText(f.target.id),"");assert.equal(f.c.getAiPreparationBindingStatus(f.target.id),"pending");
        assert.equal(f.audio.length,1,"TTS also overlaps preceding speech");
        f.finish();f.c.primeAiPreparationForPhase(f.source);await f.settle();
        assert.equal(f.c.getAiPreparationBindingStatus(f.target.id),"valid");assert.equal(f.c.getPreparedAiTurnText(f.target.id),fresh(f.calls[0]));
        f.enterTarget();assert.equal(await f.c.generateAiTurnForPhase(f.target,{duringModerator:true}),true);
        assert.equal(f.calls.length,1);assert.equal(f.audio.length,1);assert.equal(f.spoken.length,1);
    });
}

test("measured recognition can start the next turn during conferral before the source is queued",async()=>{
    const f=fixture({beforeSpeech:true});f.c.primeAiPreparationForPhase(f.current);await f.settle();
    assert.ok(f.calls.some(call=>call.recordContext.phaseId===f.target.id));
    assert.equal(f.state.transcript.length,1);assert.equal(f.c.getPreparedAiTurnText(f.target.id),"");
    f.finish();assert.equal(f.c.getAiPreparationBindingStatus(f.target.id),"valid");
});

for(const reason of ["two fewer words","two additional words","different punctuation","different cutoff status"]) {
    test(`${reason} reuses the original prepared response without another request or delayed fallback`,async()=>{
        const f=fixture();f.c.primeAiPreparationForPhase(f.source);await f.settle();
        const actual=reason==="two fewer words"?"Actual":reason==="two additional words"?f.recognized+" New objection.":reason==="different punctuation"?"Actual recognized argument!":f.recognized;
        f.finish(actual,reason.includes("cutoff")||reason==="two fewer words"?"cutoff":"complete");
        assert.equal(f.c.getAiPreparationBindingStatus(f.target.id),"valid");
        f.c.primeAiPreparationForPhase(f.source);await f.settle();
        assert.equal(f.calls.length,1);assert.equal(f.cleared.length,0);assert.equal(f.audio.length,1);
        assert.equal(f.c.getPreparedAiTurnText(f.target.id),fresh(f.calls[0]));
        f.enterTarget();await f.c.generateAiTurnForPhase(f.target,{duringModerator:true});assert.equal(f.calls.length,1);assert.equal(f.spoken.length,1);
        assert.equal(f.message.text,actual,"delivered and scoring transcripts still contain only actual speech");
    });
}

test("a small cutoff shift reuses a request still in flight without starting a replacement",async()=>{
    const request=deferred(),f=fixture({generate:()=>request.promise});
    f.c.primeAiPreparationForPhase(f.source);const pending=f.state.aiPreparationPromises[f.target.id];
    f.finish("Actual", "cutoff");f.c.primeAiPreparationForPhase(f.source);
    assert.equal(f.calls.length,1);assert.equal(f.state.aiPreparationPromises[f.target.id],pending);
    request.resolve(fresh(f.calls[0]));await pending;
    assert.equal(f.audio.length,1);assert.equal(f.c.getPreparedAiTurnText(f.target.id),fresh(f.calls[0]));
});

test("matching delivery reuses a still pending prediction request across phase handoff",async()=>{
    const request=deferred(),f=fixture({generate:()=>request.promise});
    f.c.primeAiPreparationForPhase(f.source);f.finish();f.enterTarget();const playback=f.c.generateAiTurnForPhase(f.target,{duringModerator:true});
    assert.equal(f.calls.length,1);request.resolve(fresh(f.calls[0]));assert.equal(await playback,true);
    assert.equal(f.audio.length,1);assert.equal(f.spoken.length,1);
});

for(const cause of ["new run","closed","interrupted target"])test(`${cause} rejects late speculative work before text or audio can be published`,async()=>{
    const request=deferred(),f=fixture({generate:()=>request.promise});f.c.primeAiPreparationForPhase(f.source);
    const pending=f.state.aiPreparationPromises[f.target.id];
    if(cause==="new run")f.state.matchRunId++;else if(cause==="closed")f.state.sessionClosed=true;else f.state.interruptedPhaseIds.add(f.target.id);
    request.resolve(fresh(f.calls[0]));assert.equal(await pending,"");assert.equal(f.audio.length,0);assert.deepEqual(f.state.aiPreparedTurns,{});
});

test("unresolved source, human participants and absent measurements cannot be treated as predictions",()=>{
    for(const cause of ["human source","human target","missing","old run","unresolved"]){
        const f=fixture();if(cause==="human source")f.state.participantTypes[f.source.speaker]="human";
        if(cause==="human target")f.state.participantTypes[f.target.speaker]="human";
        if(cause==="missing")f.state.speechContextPredictions.clear();
        if(cause==="old run")f.prediction.matchRunId--;
        if(cause==="unresolved")delivery.sealUnresolved(f.message);
        f.c.primeAiPreparationForPhase(f.source);assert.equal(f.calls.length,0,cause);
    }
});

test("one-step preparation never recursively uses the predicted next answer as another source",async()=>{
    const f=fixture();f.c.primeAiPreparationForPhase(f.source);await f.settle();
    f.state.speechContextPredictions.set(f.target.id,{...f.prediction,sourceText:f.state.aiPreparedTurns[f.target.id].text,text:"UNHEARD_NEXT_RESPONSE"});
    f.c.primeAiPreparationForPhase(f.source);f.c.primeAiPreparationForPhase(f.target);await f.settle();assert.equal(f.calls.length,1);
});

test("presentation audio ready during the case reading can already prepare commentary",async()=>{
    const f=fixture({beforeSpeech:true}),reading=f.state.phases.find(p=>p.kind==="moderatorCase"&&p.caseNum===1);
    f.state.currentPhaseIndex=f.state.phases.indexOf(reading);
    f.state.aiPreparedTurns[f.source.id]={text:f.generated,question:""};
    f.c.primeAiPreparationForPhase(reading);await f.settle();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].recordContext.phaseId,f.target.id);assert.equal(f.message.text,"");
});
