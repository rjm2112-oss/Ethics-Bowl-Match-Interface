"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {MeasuredPlaybackClock}=require("../scripts/measured-playback-clock.cjs");
test("accelerated clock preserves measured duration at the production playback rate",()=>{
    for(const baseRate of [.924,1,1.09])for(const factor of [1,2,6,8]){
        const clock=new MeasuredPlaybackClock(),duration=140,actualRate=baseRate*factor;
        for(let frame=0;frame<=100;frame++)clock.observe({id:1,mediaSeconds:duration*frame/100,baseRate,actualRate,knownTiming:true,realMs:duration/actualRate*1000*frame/100});
        assert.ok(Math.abs(clock.now(duration/actualRate*1000)-duration/baseRate*1000)<1e-7);
    }
});
test("network waits, stalls, unknown durations and chunk transitions keep real time",()=>{
    const clock=new MeasuredPlaybackClock();
    const sample=(id,mediaSeconds,realMs,knownTiming=true)=>clock.observe({id,mediaSeconds,realMs,baseRate:1,actualRate:8,knownTiming});
    sample(1,0,1000);sample(1,8,2000);assert.equal(clock.now(2000),9000);
    sample(1,8,12000);assert.equal(clock.now(12000),19000);
    sample(2,0,13000);sample(2,8,14000,false);sample(2,16,15000,false);assert.equal(clock.now(15000),22000);
    clock.forget();assert.equal(clock.now(35000),42000);
});
test("rate changes account for media only once and seeking invalidates a run",()=>{
    const clock=new MeasuredPlaybackClock();
    const sample=(mediaSeconds,realMs,actualRate)=>clock.observe({id:1,mediaSeconds,realMs,baseRate:1,actualRate,knownTiming:true});
    sample(0,0,1);sample(5,5000,1);sample(5,5000,8);sample(13,6000,8);sample(13,6000,1);sample(14,7000,1);
    assert.equal(clock.now(7000),14000);
    assert.throws(()=>sample(100,7020,1),/jumped/);
});
