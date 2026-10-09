"use strict";
// Run with Electron, not Node. No remote debugging port and no video recording.
const fs=require("node:fs"),path=require("node:path"),{app}=require("electron");
const {MeasuredPlaybackClock}=require("./measured-playback-clock.cjs");
const arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const repo=path.resolve(arg("app",path.join(__dirname,"..")));
const out=path.resolve(arg("output",path.join(repo,"evidence","full-match-"+Date.now())));
const locale=arg("locale","en"),factor=Number(arg("factor","6"));
const judgePanel=arg("judge-panel","all-gpt"),repeatableCoin=arg("repeatable-coin","no")==="yes";
if(!require(path.join(repo,"src/shared/model-catalog")).JUDGE_PANELS.some(panel=>panel.id===judgePanel))throw Error("Invalid judge panel");
if(!["en","fr-ca"].includes(locale)||!Number.isFinite(factor)||factor<1||factor>8)throw Error("Invalid locale or playback factor");
const guardPath=arg("budget-module","");
if(!guardPath)throw Error("A provider budget guard module is required before paid requests can run.");
fs.mkdirSync(out,{recursive:true,mode:0o700});
const guard=require(path.resolve(guardPath));
global.fetch=guard.guardedFetch;
const credentials=arg("credentials","");
if(credentials)Object.assign(process.env,require(path.join(repo,"src/main/env")).parseEnvFile(fs.readFileSync(credentials,"utf8")));
process.env.ETHICS_SPEECH_RECORDS_DIR=path.join(out,"spoken-generations");
process.env.ETHICS_API_AUDIT_PATH=path.join(out,"api-audit.jsonl");
app.setName("ethics_bowl_electron");app.setPath("userData",path.join(out,"profile"));
const report={startedAt:new Date().toISOString(),app:repo,locale,factor,judgePanel,repeatableCoin,errors:[],passed:false};
const write=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2),{mode:0o600});
let finished=false,monitor,windowRef,lastPhase="",samples=0;
async function finish(error){
    if(finished)return;finished=true;clearInterval(monitor);
    if(error)report.errors.push(error.message||String(error));
    try{if(windowRef&&!windowRef.isDestroyed()){
        report.final=await windowRef.webContents.executeJavaScript("window.__matchQa?.snapshot(true)");
        fs.writeFileSync(path.join(out,"final.png"),(await windowRef.webContents.capturePage()).toPNG());
    }}catch(e){report.errors.push(e.message);}
    report.finishedAt=new Date().toISOString();report.passed=!report.errors.length;
    report.budget=guard.budget?.providers;write("result.json",report);
    console.log(JSON.stringify({event:"finished",passed:report.passed,errors:report.errors,output:out}));
    app.exit(report.passed?0:1);
}

// Capture the normal renderer context without editing its source or IPC bridge.
const expose=`(()=>{let registry;Object.defineProperty(window,"EthicsRenderer",{configurable:true,get:()=>registry,set(value){if(value===registry)return;registry=new Proxy(value,{set(target,key,api){target[key]={...api,create(context){window.__qaContext=context;return api.create(context);}};return true;}});}});})();`;

function installRendererQa(Clock,factor,locale,judgePanel,repeatableCoin){
    const c=window.__qaContext;if(!c)throw Error("Normal renderer context was not captured");
    if(repeatableCoin){const random=Math.random;let choices=3;Math.random=()=>choices-->0?.25:random();}
    const s=c.state,clock=new Clock(),events=[],failures=[],ready=new Set(),recognizedAudio=new WeakSet();
    const realSetInterval=window.setInterval.bind(window),realNow=()=>performance.now();
    let observed=null,baseRate=1,actualRate=1,timerHooks=0,accelerationStarted=0;
    const log=(event,details={})=>events.push({event,realMs:realNow(),virtualMs:clock.now(realNow()),...details});
    const fail=message=>{if(!failures.includes(message)){failures.push(message);log("failure",{message});}};
    function observe(){
        const p=s.currentSpeechRecordPlayback,a=s.speechAudioEl;
        if(!p||!a){clock.forget();observed=null;return;}
        if(observed!==p){
            clock.forget();observed=p;baseRate=Number(p.entry.playbackRate)||1;actualRate=baseRate;
            if(p.wordAlignment)recognizedAudio.add(p);
            else if(p.wordAlignmentPromise)p.wordAlignmentPromise.then(alignment=>{if(alignment)recognizedAudio.add(p);}).catch(error=>fail(error.message));
            log("playback",{phaseId:p.entry.phaseId,kind:p.entry.kind,chunk:p.entry.chunkIndex,naturalSeconds:p.naturalDurationSeconds,baseRate});
        }
        const known=Number.isFinite(p.naturalDurationSeconds)&&p.naturalDurationSeconds>0&&Number.isFinite(a.duration)&&Math.abs(a.duration-p.naturalDurationSeconds)<.2;
        clock.observe({id:p,mediaSeconds:a.currentTime,baseRate,actualRate,knownTiming:known,realMs:realNow()});
        if(a.paused||a.ended)return;
        const phase=c.services.getPhaseById(p.entry.phaseId);
        let target=null;
        if(phase?.kind==="speech"&&phase.subtype!=="response")target=s.phases.find(q=>q.id===`case${phase.caseNum}-${phase.subtype==="presentation"?"commentary":"response"}`);
        if(phase?.kind==="judgeQuestion")target=s.phases.find(q=>q.id===`case${phase.caseNum}-judge${phase.judgeNumber}-answer`);
        const dependentReady=!target||!!s.wholeSpeechPreparations.get(target.id)?.plan;
        const recognized=recognizedAudio.has(p);
        const desired=known&&recognized&&dependentReady&&a.currentTime>baseRate*(p.entry.kind==="moderator"?2:5)?baseRate*factor:baseRate;
        if(desired!==actualRate){
            actualRate=desired;a.playbackRate=desired;
            clock.observe({id:p,mediaSeconds:a.currentTime,baseRate,actualRate,knownTiming:known,realMs:realNow()});
            if(desired>baseRate)accelerationStarted++;
            log("rate",{phaseId:p.entry.phaseId,mediaSeconds:a.currentTime,actualRate,baseRate,knownTiming:known,recognized,dependentReady});
        }
    }
    // The production timer is deliberately the only interval on virtual time.
    // Assert its source signature so a refactor cannot silently skip this hook.
    c.platform.window=new Proxy(window,{get(target,key){
        if(key!=="setInterval"){const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}
        return (callback,ms,...args)=>{
            if(ms!==1000||!String(callback).includes("context.state.timer.remaining -= 1"))return realSetInterval(callback,ms,...args);
            timerHooks++;let previous=clock.now(realNow()),wasRunning=s.timer.running;
            const handle=realSetInterval(()=>{
                try{
                    observe();const now=clock.now(realNow());
                    if(!s.timer.running||!wasRunning)previous=now;
                    wasRunning=s.timer.running;
                    while(s.timer.running&&s.timer.intervalId===handle&&now-previous>=1000){previous+=1000;callback(...args);}
                }catch(error){fail(error.message);}
            },20);
            return handle;
        };
    }});
    const api=c.services.callAI;c.services.callAI=async request=>{
        const row={phaseId:request.recordContext?.phaseId,currentPhase:c.services.getCurrentPhase()?.id,model:request.model,reasoning:request.reasoningEffort,request};
        log("request",row);const started=realNow();
        try{const result=await api(request);log("response",{phaseId:row.phaseId,currentPhase:row.currentPhase,model:row.model,latencyMs:realNow()-started});return result;}
        catch(error){fail(error.message);throw error;}
    };
    realSetInterval(()=>{
        try{
            observe();
            for(const [id,record] of s.wholeSpeechPreparations)if(record.plan&&!ready.has(id)){ready.add(id);log("audio_ready",{phaseId:id,naturalSeconds:record.totalAudioDurationSeconds});}
        }catch(error){fail(error.message);}
    },20);
    // Account for the last media interval before production resets the element.
    document.addEventListener("ended",()=>{try{observe();}catch(e){fail(e.message);}},true);
    document.addEventListener("pause",()=>{try{observe();}catch(e){fail(e.message);}},true);
    function snapshot(full=false){
        const phase=c.services.getCurrentPhase(),p=s.currentSpeechRecordPlayback,a=s.speechAudioEl;
        const body=c.services.getMessageBodyEl(s.speechProgressMessageIndex),chat=document.getElementById("chat"),highlight=body?.querySelector(".speech-speaking");
        const chatBox=chat?.getBoundingClientRect(),highlightBox=highlight?.getBoundingClientRect();
        const controls=[...document.querySelectorAll("button")].filter(b=>/stop.*reading|arrêter.*lecture/i.test(b.innerText));
        const row={phase:phase?.id,kind:phase?.kind,completed:s.completed,started:s.started,timer:s.timer.remaining,timerRunning:s.timer.running,busy:s.busy,
            active:s.speechPlaybackActive,queued:s.speechQueue.length,processing:s.speechProcessing,substantiveCount:s.transcript.filter(m=>["ai","ai-alt","judge"].includes(m.kind)).length,
            scorecards:Object.keys(s.aiFinalJudgeScorecards),errors:failures.slice(),timerHooks,accelerationStarted,realMs:realNow(),virtualMs:clock.now(realNow()),
            speech:p?{phaseId:p.entry.phaseId,kind:p.entry.kind,mediaSeconds:a?.currentTime,duration:p.naturalDurationSeconds,baseRate,actualRate,recognized:!!p.wordAlignment}:null,
            visibleTextLength:body?.innerText.length||0,highlightFraction:highlightBox&&chatBox?(highlightBox.y-chatBox.y)/chatBox.height:null,
            horizontalOverflow:document.documentElement.scrollWidth>innerWidth,judgeModels:document.getElementById("matchJudgeModels")?.innerText,
            stopReadingEnabled:controls.some(b=>!b.disabled),status:document.getElementById("statusLine")?.innerText};
        row.followPaused=s.speechFollowPaused;
        if(full)Object.assign(row,{events,transcript:s.transcript,phases:s.phases,scorecardDetails:s.aiFinalJudgeScorecards,preparationErrors:s.aiPreparationErrors,scoringErrors:s.aiFinalJudgeScoringErrors});
        return row;
    }
    window.__matchQa={snapshot};
    function set(id,value){const el=document.getElementById(id);if(!el)throw Error("Missing setup field "+id);el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}
    s.locale=locale;c.services.applyLocaleToUi();
    set("participantOneTypeSelect","ai");set("participantTwoTypeSelect","ai");set("participantOneModelSelect","gpt-6.1-sol");set("modelSelect","claude-opus-5-5");
    set("humanNameInput","GPT-6.1 Sol");set("aiNameInput","Claude Opus 5.5");set("judgeModeSelect","ai");set("judgePanelPresetSelect",judgePanel);set("moderatorReadFullCaseSelect","no");
    const cases=window.EthicsCaseArchive.findArchiveCases(window.EthicsCaseArchiveData,locale).filter(v=>v.discussionQuestions?.length).slice(0,2);
    cases.forEach((item,index)=>{const picker=document.getElementById("archiveCase"),option=[...picker.options].find(o=>o.textContent.includes(item.title));
        if(!option)throw Error("Archived case unavailable");set("archiveCase",option.value);document.getElementById("archiveUse"+(index+1)).click();
        if(document.getElementById(`case${index+1}QuestionInput`).value!==item.discussionQuestions[0])throw Error("First discussion question was not selected");
    });
    if(cases.length!==2)throw Error("Two cases are required");
    const button=document.getElementById("startMatchBtn");if(button.disabled)throw Error("Cannot start match");button.click();
    return {cases:cases.map(v=>({title:v.title,question:v.discussionQuestions[0]})),locale,factor};
}

app.on("browser-window-created",(_event,win)=>{
    windowRef=win;win.webContents.setBackgroundThrottling(false);
    win.webContents.debugger.attach("1.3");
    const load=win.loadFile.bind(win);win.loadFile=async(...args)=>{
        await win.webContents.loadURL("about:blank");
        await win.webContents.debugger.sendCommand("Page.enable");
        await win.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument",{source:expose});
        return load(...args);
    };
    win.webContents.on("render-process-gone",(_e,details)=>void finish(Error("Renderer exited: "+details.reason)));
    win.webContents.on("console-message",event=>{
        if(event.level==="error"||event.level>=3){report.errors.push(event.message);console.error(event.message);}
        fs.appendFileSync(path.join(out,"renderer.jsonl"),JSON.stringify({at:new Date().toISOString(),level:event.level,message:event.message})+"\n",{mode:0o600});
    });
    win.webContents.on("did-finish-load",async()=>{
        if(!win.webContents.getURL().includes("debater.html"))return;
        try{
            win.setContentSize(1180,820);win.setPosition(24,60);
            report.setup=await win.webContents.executeJavaScript(`(${installRendererQa.toString()})(${MeasuredPlaybackClock.toString()},${factor},${JSON.stringify(locale)},${JSON.stringify(judgePanel)},${repeatableCoin})`,true);
            write("setup.json",report.setup);
            let polling=false;
            monitor=setInterval(async()=>{
                if(polling||finished)return;polling=true;
                try{
                    const status=await win.webContents.executeJavaScript("window.__matchQa.snapshot()");samples++;
                    fs.appendFileSync(path.join(out,"samples.jsonl"),JSON.stringify(status)+"\n",{mode:0o600});write("status.json",status);
                    if(samples%15===0)fs.writeFileSync(path.join(out,"latest.png"),(await win.webContents.capturePage()).toPNG());
                    if(status.phase!==lastPhase){lastPhase=status.phase;console.log(JSON.stringify({event:"phase",...status}));fs.writeFileSync(path.join(out,`${String(samples).padStart(4,"0")}-${lastPhase||"opening"}.png`),(await win.webContents.capturePage()).toPNG());}
                    if(status.errors.length)throw Error(status.errors.join("; "));
                    if(status.horizontalOverflow)throw Error("Horizontal overflow during match");
                    if(status.active&&["speech","judgeAnswer"].includes(status.kind)&&["ai","ai-alt"].includes(status.speech?.kind)&&status.stopReadingEnabled)throw Error("Participant can be cut off with Stop Reading");
                    if(status.active&&status.speech?.mediaSeconds>1&&!status.visibleTextLength)throw Error("Spoken text is not visible");
                    if(status.completed&&!status.active&&!status.queued&&!status.processing){
                        const final=await win.webContents.executeJavaScript("window.__matchQa.snapshot(true)");
                        const substantive=final.transcript.filter(m=>["ai","ai-alt","judge"].includes(m.kind)&&final.phases.some(p=>p.id===m.phaseId&&["speech","judgeQuestion","judgeAnswer"].includes(p.kind)));
                        if(final.scorecards.length!==3||substantive.length!==18||substantive.some(m=>!["complete","cutoff"].includes(m.speechDeliveryState)))throw Error("Incomplete delivered match or scorecards");
                        if(final.timerHooks<12||factor>1&&!final.accelerationStarted)throw Error("Measured clock was not exercised");
                        await finish();
                    }
                    if(Date.now()-Date.parse(report.startedAt)>55*60*1000)throw Error("Full-match deadline exceeded");
                }catch(error){await finish(error);}finally{polling=false;}
            },1000);
        }catch(error){await finish(error);}
    });
});
process.on("uncaughtException",error=>void finish(error));
process.on("unhandledRejection",error=>void finish(error));
require(path.join(repo,"main.js"));
