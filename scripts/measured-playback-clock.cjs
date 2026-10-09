"use strict";

// Only continuous, measured media progression can save match-clock time.
// API requests, silence, stalls and all other timers keep their real clock.
class MeasuredPlaybackClock {
    constructor() { this.extraMs=0; this.previous=null; }
    observe({id,mediaSeconds,baseRate,actualRate,knownTiming,realMs}) {
        const prior=this.previous;
        if(prior && prior.id===id && knownTiming && prior.knownTiming
            && baseRate===prior.baseRate && actualRate===prior.actualRate
            && baseRate>0 && actualRate>=baseRate) {
            const mediaDelta=mediaSeconds-prior.mediaSeconds;
            const wallDelta=(realMs-prior.realMs)/1000;
            if(mediaDelta<-.001 || mediaDelta>Math.max(.3,wallDelta*actualRate+.3)) {
                throw new Error("Playback jumped; accelerated timing is no longer valid.");
            }
            if(mediaDelta>0)this.extraMs+=1000*mediaDelta*(1/baseRate-1/actualRate);
        }
        this.previous={id,mediaSeconds,baseRate,actualRate,knownTiming,realMs};
        return this.now(realMs);
    }
    forget(){this.previous=null;}
    now(realMs){return realMs+this.extraMs;}
}
module.exports={MeasuredPlaybackClock};
