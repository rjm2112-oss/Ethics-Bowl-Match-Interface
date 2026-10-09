(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.EthicsCasePacket=api;})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    function extractQuestions(text) {
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        const key = line => line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
        const start = lines.findIndex(line => !/[?？]/.test(line) && /^(?:discussions?questions|matiereadiscussion|questionsdediscussion|questionspourladiscussion)$/.test(key(line)));
        if (start < 0) return [];
        const section = [];
        for (const line of lines.slice(start + 1)) {
            if (/^(?:furtherexplorations?|furtherreading|lectures?dapprofondissement|ressourcessupplementaires|pourallerplusloin|references|bibliographie|sources)$/.test(key(line))) break;
            if (/^(?:page\s*\d+|\d+|\d{4}\s*[-–]\s*\d{2,4}.*(?:case set|ethics bowl)|ensemble des cas.*\d{4}|canadian.*ethics bowl.*)$/i.test(line.trim())) continue;
            section.push(line.trim());
        }
        const numbered = section.some(line => /^\d{1,2}\s*[.)]\s*/.test(line));
        const result = [];
        let current = [];
        const finish = () => { const question = current.join(' ').replace(/\s+/g, ' ').trim(); if (question) result.push(question); current = []; };
        for (const line of section) {
            if (numbered) {
                const next = line.match(/^\d{1,2}\s*[.)]\s*(.*)$/);
                if (next) { finish(); current.push(next[1]); }
                else if (current.length && line) current.push(line);
            } else {
                if (!line) { finish(); continue; }
                if (current.length && /[?？][”"’')]*$/.test(current.at(-1)) && /^[A-ZÀ-ÖØ-Þ«“]/.test(line)) finish();
                current.push(line.replace(/^[•●]\s*/, ''));
            }
        }
        finish();
        return result;
    }
    function parse(text) {
        const rawPacket=String(text||"").replace(/\r\n?/g,"\n");
        const lines=rawPacket.split("\n");
        const key=line=>line.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z]/g,"");
        const start=lines.findIndex(line=>!/[?？]/.test(line) && /^(?:discussions?questions|matiereadiscussion|questionsdediscussion|questionspourladiscussion)$/.test(key(line)));
        return Object.freeze({rawPacket,narrative:(start<0?rawPacket:lines.slice(0,start).join("\n")).trim(),discussionQuestions:Object.freeze(extractQuestions(rawPacket))});
    }
    return Object.freeze({parse});
});
