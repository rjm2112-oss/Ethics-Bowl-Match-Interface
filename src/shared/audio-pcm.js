(function expose(root, factory) {
    const value = factory();
    if (typeof module === "object" && module.exports) module.exports = value;
    if (root) root.EthicsAudioPcm = value;
})(typeof globalThis === "object" ? globalThis : this, function () {
    "use strict";
    function encodePlayedPrefix(decoded,through) {
        if(!Number.isFinite(through)||through<0 || !Number.isInteger(decoded.length)||decoded.length<1 || !Number.isInteger(decoded.sampleRate)||decoded.sampleRate<1 || !Number.isInteger(decoded.numberOfChannels)||decoded.numberOfChannels<1)throw Error("Invalid decoded audio or played duration.");
        const frames=Math.min(decoded.length,Math.floor(through*decoded.sampleRate));
        if(!frames)throw Error("No played audio frames are available.");
        const bytes=new Uint8Array(44+frames*2),view=new DataView(bytes.buffer);
        const ascii=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
        ascii(0,"RIFF");view.setUint32(4,36+frames*2,true);ascii(8,"WAVE");ascii(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,decoded.sampleRate,true);view.setUint32(28,decoded.sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);ascii(36,"data");view.setUint32(40,frames*2,true);
        const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));
        for(let frame=0;frame<frames;frame++){
            let average=0;for(const channel of channels){if(!Number.isFinite(channel[frame]))throw Error("Invalid audio sample.");average+=channel[frame]/channels.length;}
            const sample=Math.max(-1,Math.min(1,average));view.setInt16(44+frame*2,sample<0?sample*32768:sample*32767,true);
        }
        return {bytes,durationSeconds:frames/decoded.sampleRate};
    }
    return Object.freeze({encodePlayedPrefix});
});
