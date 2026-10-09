(function exposeRubric(root, factory) {
    const rubric = factory();
    if (typeof module === "object" && module.exports) module.exports = rubric;
    if (root) root.EthicsBowlRubric = rubric;
})(typeof globalThis === "object" ? globalThis : this, function createRubric() {
    "use strict";

    // Official English PDF, with table columns serialized as ordered bands.
    // Preserve the published wording, team references, and point allocations.
    const SOURCE = Object.freeze({
        index: "https://www.ethicsbowl.ca/documents",
        url: "https://drive.google.com/file/d/1AmUjpKc4QOUXn8igH5_mzWfEXJo3_7Ch/view?usp=sharing",
        title: "Rubric 2025 - 2 page.pdf",
        version: "2025",
        language: "English",
        verifiedOn: "2026-10-08",
        olderFrenchUrl: "https://drive.google.com/file/d/12fJ958IkOkPAjlU6IoRWVWqHpXoKyz0n/view?usp=sharing",
        olderFrenchVersion: "June 2024"
    });
    const criterion = (id, title, points, scope, bands, note = "") => Object.freeze({
        id, title, points, scope,
        bands: Object.freeze(bands.map(([range, text]) => Object.freeze({ range, text }))),
        note
    });
    const CRITERIA = Object.freeze({
        clarity: criterion("clarity", "Clarity & Systematicity", 5, "presentation", [
            ["0-1", "… presented a clear and identifiable position in response to the moderator’s question…"],
            ["2-3", "…and supported their position with identifiable reasons…"],
            ["4-5", "…that were well articulated and jointly coherent."]
        ], "This section is about clarity, systematicity and structure only. Even if an argument wasn’t very convincing, teams can earn a 5 thanks to a very clear structure."),
        moralDimensions: criterion("moralDimensions", "Moral dimensions", 5, "presentation", [
            ["0-1", "…unequivocally identified deep moral tension(s) at the heart of the case…"],
            ["2-3", "…and applied moral concepts (duties, values, rights, responsibilities, etc.) to relevant aspects of the case…"],
            ["4-5", "…in a way that tackled the underlying moral tensions within the case."]
        ]),
        conflictingViewpoints: criterion("conflictingViewpoints", "Conflicting viewpoints", 5, "presentation", [
            ["0-1", "…acknowledged strong, conflicting viewpoint(s) that lead to reasonable disagreement…"],
            ["2-3", "…and charitably explained why these viewpoints pose a serious challenge to their position…"],
            ["4-5", "…and argued that their position better defuses the moral tension within the case."]
        ]),
        commentary: criterion("commentary", "Commentary", 10, "commentary", [
            ["0, 1, 2", "…developed a manageably small number of suggestions, questions, and critiques…"],
            ["3, 4, 5", "…that constructively critiqued the presentation…"],
            ["6, 7, 8", "…and was focused on salient and important moral considerations…"],
            ["9, 10", "…and provided the presenting team with novel options to modify their position."]
        ], "The responding team should develop a small enough number of suggestions, questions, and critiques so that the leading team can address all of them within the 3 minutes allocated."),
        response: criterion("response", "Response", 10, "response", [
            ["0, 1, 2", "…prioritized the commentary’s main suggestions, questions, and critiques…"],
            ["3, 4, 5", "… in a way that charitably explained why these viewpoints pose a serious challenge to their position…"],
            ["6, 7, 8", "…making their position clearer"],
            ["9, 10", "…and refining their position or explaining why such refinement is not required."]
        ]),
        judgesQuestions: criterion("judgesQuestions", "Judges’ questions", 20, "questioning-period", [
            ["0, 1, 2, 3, 4, 5", "…answered the judge’s question clearly…"],
            ["6, 7, 8, 9, 10", "… in a way that explicitly explained how the question impacts their position…"],
            ["11, 12, 13, 14, 15", "…in a way that makes their position clearer"],
            ["16, 17, 18, 19, 20", "…and refining their position or explaining why such refinement is not required."]
        ]),
        respectfulDialogue: criterion("respectfulDialogue", "Respectful dialogue", 5, "whole-match", [
            ["0-1", "…repeatedly acknowledged viewpoints different from their own..."],
            ["2-3", "…in a way that demonstrated genuine reflection…"],
            ["4-5", "…and improved their original position in light of the other team’s contributions, whether or not the teams agreed in the end."]
        ], "When scoring this section, judges should look beyond mere politeness, and evaluate whether the teams practiced intellectual virtues, such as honesty, genuine reflection and critical engagement.")
    });
    const SCORING_INSTRUCTIONS = Object.freeze([
        "Judges will compare the team’s performance to the tasks outlined in the boxes below.",
        "Each team “starts” at 0 points.",
        "Judges must score teams from left to right according to the sections outlined below. A team’s leftmost, uncompleted box determines their score. For example, a team who completes the 4-5 box but not the 0-1 box will receive a 0-1 for that section.",
        "Teams may attempt to complete each box in any order they wish."
    ]);

    function phaseCriteria(phase = {}) {
        if (phase.kind === "judgeAnswer") return [CRITERIA.judgesQuestions];
        if (phase.kind !== "speech") return [];
        if (phase.subtype === "presentation") return [CRITERIA.clarity, CRITERIA.moralDimensions, CRITERIA.conflictingViewpoints];
        if (phase.subtype === "commentary") return [CRITERIA.commentary];
        if (phase.subtype === "response") return [CRITERIA.response];
        return [];
    }

    function formatCriterion(value) {
        return [
            `${value.title} (${value.points} points)`,
            "The team…",
            ...value.bands.map(band => `${band.range}: ${band.text}`),
            value.note ? `Notes/Instructions: ${value.note}` : ""
        ].filter(Boolean).join("\n");
    }

    function buildTurnCriteria({ phase = {}, locale = "en" } = {}) {
        return [
            `Official Ethics Bowl Canada scoring rubric: ${SOURCE.title}; verified ${SOURCE.verifiedOn}.`,
            `Source: ${SOURCE.url}`,
            /^fr(?:-|$)/i.test(locale) ? "The current scoring rubric is supplied in its published English wording. The separately published French rubric is dated June 2024 and differs." : "",
            SCORING_INSTRUCTIONS.join("\n"),
            "Match allocation per team: presentation 15; response 10; judges’ questioning period 20; commentary on the other case 10; respectful dialogue across the whole match 5; total 60.",
            "Criteria for the current phase:",
            ...phaseCriteria(phase).map(formatCriterion),
            phase.kind === "judgeAnswer" ? "Judges’ questions: 20 points for the entire questioning period on the presented case, not 20 points for each answer." : "",
            "Whole-match criterion, applicable throughout both cases; scored once for the entire match:",
            formatCriterion(CRITERIA.respectfulDialogue)
        ].filter(Boolean).join("\n\n");
    }

    function buildFullCriteria({ locale = "en" } = {}) {
        return [
            `Official Ethics Bowl Canada scoring rubric: ${SOURCE.title}; verified ${SOURCE.verifiedOn}.`,
            `Source: ${SOURCE.url}`,
            /^fr(?:-|$)/i.test(locale) ? "The current scoring rubric is supplied in its published English wording. The separately published French rubric is dated June 2024 and differs." : "",
            SCORING_INSTRUCTIONS.join("\n"),
            "Match allocation per team: presentation 15; response 10; judges’ questioning period 20; commentary on the other case 10; respectful dialogue across the whole match 5; total 60.",
            "Presentation criteria (15 points on the presented case):",
            ...[CRITERIA.clarity, CRITERIA.moralDimensions, CRITERIA.conflictingViewpoints].map(formatCriterion),
            "Commentary on the other case (10 points):", formatCriterion(CRITERIA.commentary),
            "Response to commentary (10 points on the presented case):", formatCriterion(CRITERIA.response),
            "Judges’ questions: 20 points for the entire questioning period on the presented case, not 20 points for each answer.", formatCriterion(CRITERIA.judgesQuestions),
            "Whole-match criterion, applicable throughout both cases; scored once for the entire match:", formatCriterion(CRITERIA.respectfulDialogue)
        ].filter(Boolean).join("\n\n");
    }

    return Object.freeze({ SOURCE, CRITERIA, SCORING_INSTRUCTIONS, phaseCriteria, formatCriterion, buildTurnCriteria, buildFullCriteria });
});
