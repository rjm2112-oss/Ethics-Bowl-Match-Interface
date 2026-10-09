'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../src/shared/case-packet');
const archive = require('../src/shared/case-archive-data');

test('all French 2022–23 regional packets expose their complete discussion questions', () => {
    const cases = archive.events.find(event => event.id === '2022-23-6').cases.fr;
    const expectedCounts = [4, 3, 3, 3, 3, 4, 3, 4, 3, 3];
    assert.equal(cases.length, expectedCounts.length);
    cases.forEach((entry, index) => {
        const packet = parser.parse(entry.text);
        assert.equal(packet.discussionQuestions.length, expectedCounts[index], `Case ${entry.number}`);
        assert.ok(packet.discussionQuestions.every(question => question.includes('?')), `Case ${entry.number}`);
        assert.doesNotMatch(packet.narrative, /Matière|Lectures? compl|https?:\/\//);
        assert.doesNotMatch(packet.discussionQuestions.join(' '), /Lectures? compl|https?:\/\//);
    });
    const first = parser.parse(cases[0].text);
    assert.equal(first.discussionQuestions.at(-1), 'Lydia a-t-elle d’autres choix que de remettre la vidéo ou de ne rien faire?');
    const last = parser.parse(cases.at(-1).text);
    assert.match(last.discussionQuestions.at(-1), /^Les injonctions sont souvent utilisées contre les peuples autochtones/);
    assert.ok(last.discussionQuestions.at(-1).endsWith('gouvernement et sa police?'));
});

test('French complementary-reading headings end discussion extraction', () => {
    for (const heading of ['Lecture complémentaire', 'Lectures complémentaires']) {
        const packet = parser.parse(`Un récit.\nMatière à discuter\n1. Une question?\n${heading}\nUne citation.\nhttps://example.test/reference`);
        assert.equal(packet.narrative, 'Un récit.');
        assert.deepEqual(packet.discussionQuestions, ['Une question?']);
    }
});

test('source-verified case titles and word boundaries survive PDF extraction', () => {
    const regional = archive.events.find(event => event.id === '2022-23-6').cases.fr;
    assert.deepEqual(regional.map(entry => entry.title), [
        'La camionnette scolaire vandalisée',
        'Les règles et la compassion',
        'Repenser le recyclage',
        'Les bienfaits et méfaits de la charité',
        'Reconnaissances territoriales',
        'Délire et responsabilité',
        'Robots dotés de compassion',
        'Désobéissance professionnelle',
        'Le droit des conflits armés au XXIe siècle',
        'Le pluralisme juridique et les ordres juridiques autochtones au Canada'
    ]);
    const packet = parser.parse(regional[0].text);
    assert.equal(packet.discussionQuestions[0], 'Lydia a-t-elle l’obligation de soumettre la vidéo? Le fait qu’elle connaisse l’auteur du crime change-t-il la nature de cette obligation?');
    assert.match(packet.narrative, /récompense de 10 000 \$/);

    const national = archive.events.find(event => event.id === '2023-2024-5');
    const english = national.cases.en.find(entry => entry.number === 4);
    assert.equal(english.title, 'What is it to Harm Someone? The Sneaky Cheater and Other Considerations');
    assert.ok(parser.parse(english.text).narrative.startsWith('Imagine you are in a monogamous romantic relationship'));
    assert.equal(national.cases.fr[1].title, 'Qu’est-ce qu’une « blessure »? Infidélité sournoise et enjeux connexes');
    assert.equal(national.cases.fr[6].title, 'Manifestations à domicile');
});

test('case narratives exclude PDF page furniture and neighbouring case categories', () => {
    for (const event of archive.events) {
        for (const entries of Object.values(event.cases)) {
            for (const entry of entries) {
                assert.doesNotMatch(parser.parse(entry.text).narrative, /^\s*(?:Page\s+\d+|Ensemble des cas (?:régionaux|nationaux) pour|Cas régionaux\s+\d|\d{4}[-–]\d{2,4}.*Case Set|Canadian National Ethics Bowl Cases)/m, `${event.id}: ${entry.number}`);
            }
        }
    }
    const entries = archive.events.find(event => event.id === '2018-15').cases.en;
    for (const entry of entries.slice(0, 9)) {
        assert.doesNotMatch(entry.text, /(?:Indigenous Issues|Technology|Gender Issues|Culture and Race|Homelessness|Media|Science|Education|Relationships)\s*$/);
    }
});
