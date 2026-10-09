(function(root, factory) {
    const api = factory(typeof module === "object" && module.exports ? require("./case-packet") : root.EthicsCasePacket);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.EthicsCaseArchive = api;
})(typeof globalThis === 'object' ? globalThis : this, function(packetParser) {
    'use strict';
    const language = value => /^fr(?:-|$)/i.test(value) ? 'fr' : 'en';
    function availability(event, locale) {
        const lang = language(locale);
        if (!event.sources[lang]) return 'missing-language';
        return event.cases[lang]?.length ? 'available' : 'source-only';
    }
    function findCases(event, locale, query = '') {
        const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        return (event.cases[language(locale)] || []).filter(c =>
            `${c.number} ${c.title} ${c.text}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(q)).map(c => ({...c,...packetParser.parse(c.text),text:packetParser.parse(c.text).narrative}));
    }
    function extractDiscussionQuestions(text) {return packetParser.parse(text).discussionQuestions;}
    function findArchiveCases(data, locale, query = '', { year = '', event = '' } = {}) {
        return data.events.filter(e => (!year || e.year === year) && (!event || e.id === event))
            .flatMap(e => findCases(e, locale, query).map(c => ({ ...c, eventId: e.id, year: e.year, eventName: e.event, source: e.sources[language(locale)], locale: language(locale) })));
    }
    function mount({ data, locale, onApply }) {
        const el = id => document.getElementById(id);
        const years = el('archiveYear'), events = el('archiveEvent'), cases = el('archiveCase'), search = el('archiveSearch');
        if (!years || !data) return;
        let fr = language(locale) === 'fr', found = [], currentCase;
        const browseSelections = new Map();
        let searchSelection = '';
        const searching = () => !!search.value.trim();
        const browseKey = () => `${language(locale)}:${events.value}`;
        const t = (en, french) => fr ? french : en;
        const option = (value, label) => new Option(label, value);
        const eventLabel = event => ({ Regional: t('Regional', 'Régional'), National: t('National', 'National'), 'Case set': t('Case set', 'Ensemble de cas'), 'Regional - University Level': t('University regional', 'Régional universitaire') }[event] || event);
        const renderCase = () => {
            currentCase = found.find(c => `${c.eventId}:${c.number}` === cases.value);
            if (currentCase) {
                if (searching()) searchSelection = cases.value;
                else browseSelections.set(browseKey(), cases.value);
            }
            const previewTitle = el('archivePreviewTitle'), previewText = el('archivePreviewText');
            if (previewTitle) previewTitle.textContent = currentCase?.title || '';
            if (previewText) previewText.textContent = currentCase?.text || '';
            for (const id of ['archiveUse1', 'archiveUse2']) el(id).disabled = !currentCase;
        };
        const renderCases = () => {
            const globalSearch = searching();
            const selected = globalSearch ? searchSelection : browseSelections.get(browseKey());
            found = globalSearch
                ? findArchiveCases(data, locale, search.value)
                : findArchiveCases(data, locale, '', { year: years.value, event: events.value });
            cases.replaceChildren(...found.map(c => option(`${c.eventId}:${c.number}`, globalSearch
                ? `${c.year} · ${eventLabel(c.eventName)} · ${c.number}. ${c.title}`
                : `${c.number}. ${c.title}`)));
            if (found.some(c => `${c.eventId}:${c.number}` === selected)) cases.value = selected;
            const coverage = el('archiveCoverage');
            if (coverage) {
                const event = data.events.find(e => e.id === events.value);
                const missingLanguage = !globalSearch && event && availability(event, locale) === 'missing-language';
                coverage.textContent = found.length ? '' : missingLanguage
                    ? t('This event has no English cases. Choose another event or enter a case manually.', 'Cet événement ne contient aucun cas en français. Choisissez un autre événement ou saisissez un cas manuellement.')
                    : t('No cases match. Change the search or event, or enter a case manually.', 'Aucun cas ne correspond. Modifiez la recherche ou l’événement, ou saisissez un cas manuellement.');
                coverage.hidden = !!found.length;
            }
            cases.disabled = !found.length;
            renderCase();
        };
        const renderEvents = () => {
            const selected = events.value;
            const eligible = data.events.filter(e => e.year === years.value);
            events.replaceChildren(...eligible.map(e => option(e.id, eventLabel(e.event))));
            events.value = eligible.some(e => e.id === selected) ? selected
                : (eligible.find(e => availability(e, locale) === 'available') || eligible[0])?.id || '';
            renderCases();
        };
        const renderYears = () => {
            const selected = years.value;
            const seasons = [...new Set(data.events.map(e => e.year))];
            years.replaceChildren(...seasons.map(y => option(y, y)));
            years.value = seasons.includes(selected) ? selected : seasons[0] || '';
        };
        years.addEventListener('change', () => { search.value = ''; renderEvents(); });
        events.addEventListener('change', () => { search.value = ''; renderCases(); });
        search.addEventListener('input', renderCases);
        cases.addEventListener('change', renderCase);
        [1, 2].forEach(slot => el(`archiveUse${slot}`).addEventListener('click', () => {
            if (!currentCase) return;
            onApply(slot, { ...currentCase, event: `${currentCase.year} · ${eventLabel(currentCase.eventName)}` });
            const applied = el('archiveApplied');
            if (applied) { applied.textContent = ''; applied.hidden = true; }
        }));
        renderYears(); renderEvents();
        return Object.freeze({ setLocale(value) {
            if (language(value) === language(locale)) return;
            locale = value; fr = language(locale) === 'fr'; renderYears(); renderEvents();
        }});
    }
    function mountQuestionPickers({locale=()=>"en",onChange=()=>{}}={}) {
        const storageKey="ethics.match.questionPicker.v1",active={};let saved={};
        try{const value=JSON.parse(localStorage.getItem(storageKey)||"null");if(value?.version===1)saved=value.slots;}catch{}
        const persist=()=>localStorage.setItem(storageKey,JSON.stringify({version:1,slots:Object.fromEntries(Object.entries(active).map(([slot,a])=>[slot,{packet:a.packet,selection:a.selection,customDraft:a.customDraft}]))}));
        function refresh(slot,{packet=null,imported=false}={}) {
            const select=document.getElementById(`case${slot}QuestionSelect`),input=document.getElementById(`case${slot}QuestionInput`),wrap=document.getElementById(`case${slot}CustomQuestionWrap`),text=document.getElementById(`case${slot}TextInput`);
            if(!select || !input || !wrap || !text)return;
            const prior=active[slot]||saved?.[slot];
            const parsed=packetParser.parse(text.value);
            const selectedPacket=packet || (prior?.packet?.narrative===text.value?prior.packet:prior?.packet && parsed.discussionQuestions.length===0 ? {...prior.packet,narrative:parsed.narrative}:parsed);
            const questions=selectedPacket.discussionQuestions;
            if(!Array.isArray(questions))throw Error("A canonical case packet is required.");
            const selection=!imported&&questions.includes(prior?.selection)?prior.selection:"";
            const customDraft=imported?"":prior?.customDraft??input.value;
            text.value=selectedPacket.narrative;
            select.replaceChildren(new Option(language(locale())==="fr"?"Question personnalisée":"Custom question","custom"),...questions.map((q,i)=>new Option(`${i+1}. ${q}`,String(i))));
            select.value=selection?String(questions.indexOf(selection)):"custom";input.value=selection||customDraft;wrap.hidden=!!selection;
            active[slot]={packet:selectedPacket,selection,customDraft,select,input,wrap};persist();
        }
        for(const slot of [1,2]) {
            refresh(slot);const a=active[slot];if(!a)continue;
            a.select.addEventListener("change",()=>{const current=active[slot];current.selection=current.select.value==="custom"?"":current.packet.discussionQuestions[Number(current.select.value)]||"";current.input.value=current.selection||current.customDraft;current.wrap.hidden=!!current.selection;persist();onChange();});
            a.input.addEventListener("input",()=>{const current=active[slot];current.selection="";current.customDraft=current.input.value;current.select.value="custom";current.wrap.hidden=false;persist();onChange();});
            document.getElementById(`case${slot}TextInput`).addEventListener("input",()=>{refresh(slot);onChange();});
        }
        return Object.freeze({refresh,setPacket(slot,packet){refresh(slot,{packet,imported:true});},setLocale(){for(const slot of [1,2])refresh(slot);}});
    }
    return Object.freeze({ language, availability, findCases, findArchiveCases, extractDiscussionQuestions, mount, mountQuestionPickers });
});
