'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const archive = require('../src/shared/case-archive');
const data = require('../src/shared/case-archive-data');

test('archive contains original language texts with explicit source coverage', () => {
    assert.equal(data.events.length, 17);
    let en = 0, fr = 0;
    for (const event of data.events) {
        for (const [locale, cases] of Object.entries(event.cases)) {
            assert.match(event.sources[locale], /^https:\/\/(drive|docs)\.google\.com\//);
            assert.ok(cases.length >= event.titles.length, `${event.id} ${locale}: missing indexed cases`);
            assert.deepEqual(cases.map(c => c.number), Array.from({length: cases.length}, (_, i) => i + 1));
            for (const c of cases) {
                assert.ok(c.text.length > 150);
                assert.ok(c.title.length < 180, `Malformed title: ${event.id} ${c.number}`);
                assert.equal(c.question, '', 'Do not invent an official moderator question');
                assert.doesNotMatch(c.text, /Table of Contents|Table des matières/);
            }
            if (locale === 'en') en += cases.length; else fr += cases.length;
        }
    }
    assert.equal(en, 176); assert.equal(fr, 74);
});

test('French browsing never silently falls back to English', () => {
    const old = data.events.find(e => e.year === '2017');
    assert.equal(archive.availability(old, 'fr-ca'), 'missing-language');
    assert.deepEqual(archive.findCases(old, 'fr-ca'), []);
    assert.equal(archive.availability(old, 'en'), 'available');
    const current = data.events[0];
    assert.match(archive.findCases(current, 'fr-ca')[0].title, /L’IA/);
    assert.match(archive.findCases(current, 'en')[0].title, /AI:/);
});

test('search supports accents and exposes unextractable source packets distinctly', () => {
    const current = data.events[0];
    assert.equal(archive.findCases(current, 'fr-ca', 'deseXtinction').length, 1);
    assert.deepEqual(archive.findCases(current, 'en', 'there is no such topic'), []);
    assert.equal(archive.availability({sources:{fr:'https://example.test'},cases:{}},'fr'), 'source-only');
});

test('discussion questions preserve numbered English/French wording and multiline continuations',()=>{
 const en=archive.extractDiscussionQuestions(data.events[0].cases.en[0].text),fr=archive.extractDiscussionQuestions(data.events[0].cases.fr[0].text);
 assert.equal(en.length,4);assert.equal(fr.length,4);
 assert.equal(en[0],'Can an AI companion be a human’s friend?');
 assert.equal(fr[0],'Un être humain peut-il vraiment développer une amitié avec un compagnon IA? Peut-on vraiment éprouver des sentiments amoureux pour un compagnon IA?');
 assert.ok(en[1].endsWith('‘morally evil’ or ‘morally good’?'));
 assert.deepEqual(archive.extractDiscussionQuestions('Narrative. Should this be done?'),[]);
 assert.deepEqual(archive.extractDiscussionQuestions('Discussion Quest ions:\n1) First question?\n2. A multiline\nquestion?\nFurther Reading\nDo not include this citation?'),['First question?','A multiline question?']);
 assert.deepEqual(archive.extractDiscussionQuestions('Matière à discussion\n1. Est-ce juste?\nLecture d’approfondissement\nUne référence'),['Est-ce juste?']);
 assert.deepEqual(archive.extractDiscussionQuestions('Discussion Questions\nAn unnumbered\nquestion?\nAnother question?\nFurther Exploration\nCitation'),['An unnumbered question?','Another question?']);
});

test('default search spans all seasons/events in selected language and explicit filters narrow it',()=>{
 assert.equal(archive.findArchiveCases(data,'en').length,176);assert.equal(archive.findArchiveCases(data,'fr-ca').length,74);
 const result=archive.findArchiveCases(data,'en','Middlebury');assert.ok(result.some(c=>c.year==='2017'));
 assert.ok(result.every(c=>c.eventId&&c.year&&c.eventName&&c.locale==='en'));
 assert.equal(archive.findArchiveCases(data,'en','Middlebury',{year:'2025-2026'}).length,0);
 const french=archive.findArchiveCases(data,'fr-ca','deseXtinction');assert.ok(french.length);assert.ok(french.every(c=>c.locale==='fr'&&c.source));
 const current=data.events[0];assert.equal(archive.findArchiveCases(data,'en','',{event:current.id}).length,current.cases.en.length);
});
