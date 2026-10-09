"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const rubric = require("../src/shared/ethics-bowl-rubric");

test("official rubric maps phases to their categories and retains one 60-point allocation", () => {
    const mappings = [
        [{kind:"speech",subtype:"presentation"},["clarity","moralDimensions","conflictingViewpoints"],15],
        [{kind:"speech",subtype:"commentary"},["commentary"],10],
        [{kind:"speech",subtype:"response"},["response"],10],
        [{kind:"judgeAnswer"},["judgesQuestions"],20]
    ];
    for (const [phase,ids,points] of mappings) {
        const criteria = rubric.phaseCriteria(phase);
        assert.deepEqual(criteria.map(value=>value.id),ids);
        assert.equal(criteria.reduce((sum,value)=>sum+value.points,0),points);
        const prompt = rubric.buildTurnCriteria({phase});
        assert.equal(prompt.split("Respectful dialogue (5 points)").length-1,1);
        assert.match(prompt,/scored once for the entire match/);
        assert.match(prompt,/total 60/);
        for (const value of criteria) for (const band of value.bands) assert.ok(prompt.includes(band.text));
    }
    assert.equal(Object.values(rubric.CRITERIA).reduce((sum,value)=>sum+value.points,0),60);
    assert.equal(rubric.CRITERIA.respectfulDialogue.scope,"whole-match");
    assert.equal(rubric.CRITERIA.judgesQuestions.scope,"questioning-period");
    assert.match(rubric.buildTurnCriteria({phase:{kind:"judgeAnswer"}}),/not 20 points for each answer/);
});

test("current English wording and cumulative bands are attributed without inventing a French equivalent", () => {
    assert.equal(rubric.SOURCE.version,"2025");
    assert.equal(rubric.SOURCE.verifiedOn,"2026-10-08");
    assert.match(rubric.SOURCE.url,/1AmUjpKc4QOUXn8igH5_mzWfEXJo3_7Ch/);
    assert.match(rubric.SCORING_INSTRUCTIONS.join(" "),/leftmost, uncompleted box/);
    assert.match(rubric.SCORING_INSTRUCTIONS.join(" "),/“starts” at 0 points/);
    assert.equal(rubric.CRITERIA.clarity.bands[0].range,"0-1");
    assert.equal(rubric.CRITERIA.judgesQuestions.bands[0].range,"0, 1, 2, 3, 4, 5");
    assert.equal(rubric.CRITERIA.respectfulDialogue.bands[0].text,"…repeatedly acknowledged viewpoints different from their own...");
    const french = rubric.buildTurnCriteria({phase:{kind:"speech",subtype:"presentation"},locale:"fr-ca"});
    assert.match(french,/published English wording/);
    assert.match(french,/French rubric is dated June 2024 and differs/);
    assert.ok(french.includes(rubric.CRITERIA.moralDimensions.bands[0].text));
});
