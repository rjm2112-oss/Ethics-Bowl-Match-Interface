(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer.locale=api;}})(typeof globalThis==="object"?globalThis:this,function(){
    "use strict";
    const dependencies=Object.freeze({
    "services": [
        "normalizeLocale",
        "refreshControls",
        "refreshParticipantScoreLabels",
        "refreshTimingTestUi",
        "renderPhaseList",
        "updateApiKeyUi",
        "updateConfigBadges",
        "updatePhaseHeader"
    ],
    "settings": [
        "INITIAL_LOCALE",
        "LOGO_CANDIDATES",


        "STORAGE_KEYS",
        "TIMING_TEST_MODE"
    ],
    "ui": [
        "instructionsLinkEl",
        "judgeInputs",
        "localeToggleBtnEl"
    ],
    "platform": [
        "Image",
        "URL",
        "document",
        "localStorage",
        "window"
    ]
});
    function create(context) {


        function isFrenchLocale() {
            return context.state.locale === "fr-ca";
        }

        function l(en, fr) {
            return isFrenchLocale() ? fr : en;
        }

        function caseLabel(caseNum) {
            return isFrenchLocale() ? `Cas ${caseNum}` : `Case #${caseNum}`;
        }

        function judgeLabel(judgeNumber) {
            return isFrenchLocale() ? `Juge ${judgeNumber}` : `Judge ${judgeNumber}`;
        }

        function moderatorLabel() {
            return l("Moderator", "Modérateur");
        }

        function coinSideLabel(value) {
            return value === "heads" ? l("heads", "face") : l("tails", "pile");
        }

        function phaseSubtypeLabel(subtype) {
            if (subtype === "presentation") return l("Presentation", "Présentation");
            if (subtype === "commentary") return l("Commentary", "Commentaire");
            if (subtype === "response") return l("Response", "Réplique");
            return subtype || "";
        }

        function normalizeParticipantMode(value) {
            return String(value || "").toLowerCase() === "ai" ? "ai" : "human";
        }

        function localizedHref(path, locale = context.state.locale) {
            const url = new context.platform.URL(path, context.platform.window.location.href);
            url.searchParams.set("lang", context.services.normalizeLocale(locale));
            if (context.settings.TIMING_TEST_MODE) url.searchParams.set("timingTest", "1");
            return url.toString();
        }

        function initSiteLogo() {
            const logoEls = Array.from(context.platform.document.querySelectorAll("[data-logo-slot]"));
            const fallbackEls = Array.from(context.platform.document.querySelectorAll("[data-logo-fallback]"));
            if (!logoEls.length) return;

            let index = 0;

            const showFallbacks = () => {
                logoEls.forEach((el) => { el.hidden = true; });
                fallbackEls.forEach((el) => { el.hidden = false; });
            };

            const showLogos = (candidate) => {
                logoEls.forEach((el) => {
                    el.src = candidate;
                    el.hidden = false;
                });
                fallbackEls.forEach((el) => { el.hidden = true; });
            };

            const tryNext = () => {
                if (index >= context.settings.LOGO_CANDIDATES.length) {
                    showFallbacks();
                    return;
                }

                const candidate = context.settings.LOGO_CANDIDATES[index];
                const probe = new context.platform.Image();
                probe.onload = () => showLogos(candidate);
                probe.onerror = () => {
                    index += 1;
                    tryNext();
                };
                probe.src = candidate;
            };

            tryNext();
        }

        function applyStaticTranslations(root = context.platform.document) {
            root.querySelectorAll("[data-i18n-en][data-i18n-fr]").forEach((el) => {
                el.textContent = isFrenchLocale() ? el.dataset.i18nFr : el.dataset.i18nEn;
            });
            root.querySelectorAll("[data-i18n-placeholder-en][data-i18n-placeholder-fr]").forEach((el) => {
                el.placeholder = isFrenchLocale() ? el.dataset.i18nPlaceholderFr : el.dataset.i18nPlaceholderEn;
            });
            root.querySelectorAll("[data-i18n-title-en][data-i18n-title-fr]").forEach((el) => {
                el.title = isFrenchLocale() ? el.dataset.i18nTitleFr : el.dataset.i18nTitleEn;
            });
        }

        function localeDirectiveForModels() {
            return isFrenchLocale()
            ? "All user-facing output must be in natural Québec French. Moderator text, judge questions, participant speeches, and scorecard comments must all be in Québec French. Do not switch to English unless directly quoting source text that is itself English."
            : "";
        }

        function sanitizeText(value) {
            return String(value || "")
            .replace(/\r\n?/g, "\n")
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
            .trim();
        }

        function normalizeSpeechText(text) {
            return String(text || "").replace(/\s+/g, " ").trim();
        }

        function combineDraftAndSpeech(draft, speech) {
            const left = String(draft || "").trim();
            const right = normalizeSpeechText(speech);
            if (!left) return right;
            if (!right) return left;
            return `${left} ${right}`.trim();
        }

        function applyLocaleToUi() {
            context.state.locale = context.services.normalizeLocale(context.state.locale || context.settings.INITIAL_LOCALE);
            context.platform.localStorage.setItem(context.settings.STORAGE_KEYS.locale, context.state.locale);
            context.platform.document.documentElement.lang = isFrenchLocale() ? "fr-CA" : "en";
            context.platform.document.title = l("Ethics Bowl Match Interface", "Interface de match de la Coupe éthique Canada");
            applyStaticTranslations();
            if (context.ui.instructionsLinkEl) context.ui.instructionsLinkEl.href = localizedHref("instructions.html", context.state.locale);
            if (context.ui.localeToggleBtnEl) {
                const nextLocale = isFrenchLocale() ? "en" : "fr-ca";
                context.ui.localeToggleBtnEl.textContent = isFrenchLocale() ? "English" : "Français";
                context.ui.localeToggleBtnEl.href = localizedHref("debater.html", nextLocale);
            }
            if (context.ui.judgeInputs[0]?.name && !sanitizeText(context.ui.judgeInputs[0].name.value)) context.ui.judgeInputs[0].name.value = judgeLabel(1);
            if (context.ui.judgeInputs[1]?.name && !sanitizeText(context.ui.judgeInputs[1].name.value)) context.ui.judgeInputs[1].name.value = judgeLabel(2);
            if (context.ui.judgeInputs[2]?.name && !sanitizeText(context.ui.judgeInputs[2].name.value)) context.ui.judgeInputs[2].name.value = judgeLabel(3);
            context.services.refreshParticipantScoreLabels();
            context.services.renderPhaseList();
            context.services.updatePhaseHeader();
            context.services.refreshControls();
            context.services.updateConfigBadges();
            context.services.updateApiKeyUi();
            context.services.refreshTimingTestUi();
        }
        return Object.freeze({isFrenchLocale,l,caseLabel,judgeLabel,moderatorLabel,coinSideLabel,phaseSubtypeLabel,normalizeParticipantMode,localizedHref,initSiteLogo,applyStaticTranslations,localeDirectiveForModels,sanitizeText,normalizeSpeechText,combineDraftAndSpeech,applyLocaleToUi});
    }
    return Object.freeze({create,dependencies});
});
