(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer.timing=api;}})(typeof globalThis==="object"?globalThis:this,function(){
    "use strict";
    const dependencies=Object.freeze({
    "services": [
        "formatPreciseDuration",
        "l",
        "setStatus"
    ],
    "settings": [
        "TIMING_TEST_MODE",
        "TIMING_TEST_RESULT_LIMIT"
    ],
    "ui": [
        "timingTestModeNoteEl",
        "timingTestPanelEl",
        "timingTestResultsEl"
    ],
    "platform": [
        "URL",
        "document"
    ]
});
    function create(context) {
        function getTimingTestFastForwardForMessage() {
            return context.settings.TIMING_TEST_MODE;
        }

        function ensureTimingPreviewAudioEl() {
            if (context.state.timingPreviewAudioEl && context.platform.document.body.contains(context.state.timingPreviewAudioEl)) {
                return context.state.timingPreviewAudioEl;
            }
            const audioEl = context.platform.document.createElement("audio");
            audioEl.preload = "auto";
            audioEl.hidden = true;
            audioEl.setAttribute("aria-hidden", "true");
            if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
            if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
            context.platform.document.body.appendChild(audioEl);
            context.state.timingPreviewAudioEl = audioEl;
            return audioEl;
        }

        function stopTimingTestPreview({ rerender = true } = {}) {
            context.state.timingPreviewToken += 1;
            context.state.timingPreviewTranscriptIndex = -1;
            const resolveCurrent = context.state.timingPreviewResolve;
            context.state.timingPreviewResolve = null;
            const audioEl = context.state.timingPreviewAudioEl;
            if (audioEl) {
                try {
                    audioEl.pause();
                    audioEl.currentTime = 0;
                } catch {}
                audioEl.onended = null;
                audioEl.onerror = null;
                audioEl.removeAttribute("src");
                try { audioEl.load(); } catch {}
            }
            if (typeof resolveCurrent === "function") resolveCurrent();
            if (rerender) renderTimingTestResults();
        }

        function revokeTimingTestAudioChunks(chunks) {
            (chunks || []).forEach((chunk) => {
                if (!chunk?.audioUrl) return;
                try { context.platform.URL.revokeObjectURL(chunk.audioUrl); } catch {}
                chunk.audioUrl = "";
            });
        }

        function clearTimingTestAudioCache() {
            stopTimingTestPreview({ rerender: false });
            context.state.timingTestMeasurements.forEach((measurement) => {
                revokeTimingTestAudioChunks(measurement?.audioChunks);
            });
            context.state.timingTestResults.forEach((result) => {
                revokeTimingTestAudioChunks(result?.audioChunks);
            });
        }

        async function playTimingTestResult(result) {
            if (!result?.audioChunks?.length) return;
            if (context.state.timingPreviewTranscriptIndex === result.transcriptIndex) {
                stopTimingTestPreview();
                return;
            }

            stopTimingTestPreview({ rerender: false });
            const token = context.state.timingPreviewToken;
            context.state.timingPreviewTranscriptIndex = result.transcriptIndex;
            renderTimingTestResults();
            const audioEl = ensureTimingPreviewAudioEl();
            const playbackRate = result.playbackPlan.playbackRate;

            try {
                for (const chunk of result.audioChunks) {
                    if (token !== context.state.timingPreviewToken || !chunk?.audioUrl) break;
                    await new Promise((resolve, reject) => {
                        let settled = false;
                        const finish = (error = null) => {
                            if (settled) return;
                            settled = true;
                            if (context.state.timingPreviewResolve === finish) context.state.timingPreviewResolve = null;
                            audioEl.onended = null;
                            audioEl.onerror = null;
                            if (error) reject(error);
                            else resolve();
                        };
                        context.state.timingPreviewResolve = finish;
                        audioEl.src = chunk.audioUrl;
                        audioEl.defaultPlaybackRate = playbackRate;
                        audioEl.playbackRate = playbackRate;
                        if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
                        if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
                        audioEl.onended = () => finish();
                        audioEl.onerror = () => finish(new Error("Timing preview playback failed."));
                        try {
                            const playPromise = audioEl.play();
                            if (playPromise && typeof playPromise.catch === "function") playPromise.catch((error) => finish(error));
                        } catch (error) {
                            finish(error);
                        }
                    });
                }
            } catch (error) {
                if (token === context.state.timingPreviewToken) {
                    context.services.setStatus(error?.message || context.services.l("Timing preview playback failed.", "La lecture de l’aperçu minuté a échoué."), true);
                }
            } finally {
                if (token === context.state.timingPreviewToken) stopTimingTestPreview();
            }
        }

        function renderTimingTestResults() {
            if (!context.ui.timingTestResultsEl) return;
            if (context.ui.timingTestModeNoteEl) {
                const resultCount = context.state.timingTestResults.length;
                const runComplete = context.settings.TIMING_TEST_RESULT_LIMIT > 0 && resultCount >= context.settings.TIMING_TEST_RESULT_LIMIT;
                context.ui.timingTestModeNoteEl.textContent = runComplete
                    ? context.services.l(
                        `${context.settings.TIMING_TEST_RESULT_LIMIT}-test run complete. All results remain open below for comparison.`,
                        `Série de ${context.settings.TIMING_TEST_RESULT_LIMIT} tests terminée. Tous les résultats restent ouverts ci-dessous pour comparaison.`
                    )
                    : context.services.l(
                        `Generated audio is measured exactly and adjusted virtually without playback.${context.settings.TIMING_TEST_RESULT_LIMIT ? ` Result ${resultCount} of ${context.settings.TIMING_TEST_RESULT_LIMIT}.` : ""}`,
                        `L’audio généré est mesuré avec exactitude et ajusté virtuellement sans lecture.${context.settings.TIMING_TEST_RESULT_LIMIT ? ` Résultat ${resultCount} sur ${context.settings.TIMING_TEST_RESULT_LIMIT}.` : ""}`
                    );
            }
            context.ui.timingTestResultsEl.replaceChildren();
            if (!context.state.timingTestResults.length) {
                const empty = context.platform.document.createElement("div");
                empty.className = "small-note";
                empty.textContent = context.services.l(
                    "Timed speech measurements will appear here.",
                    "Les mesures des prises de parole minutées apparaîtront ici."
                );
                context.ui.timingTestResultsEl.appendChild(empty);
                return;
            }

            [...context.state.timingTestResults].reverse().forEach((result) => {
                const card = context.platform.document.createElement("article");
                card.className = "timing-sheet timing-test-result";

                const title = context.platform.document.createElement("div");
                title.className = "timing-test-result-title";
                title.textContent = `${result.phaseTitle} — ${result.label}`;

                const metrics = context.platform.document.createElement("div");
                metrics.className = "small-note";
                metrics.textContent = context.services.l(
                    `Natural at 1.000×: ${context.services.formatPreciseDuration(result.naturalSummary.audioDurationSeconds)} audio • ${result.naturalSummary.wordsPerMinute.toFixed(1)} WPM`,
                    `Naturel à 1.000× : ${context.services.formatPreciseDuration(result.naturalSummary.audioDurationSeconds)} d’audio • ${result.naturalSummary.wordsPerMinute.toFixed(1)} mots/min`
                );

                const adjustedMetrics = context.platform.document.createElement("div");
                adjustedMetrics.className = "small-note";
                adjustedMetrics.textContent = context.services.l(
                    `Adjusted at ${result.playbackPlan.playbackRate.toFixed(3)}×: ${context.services.formatPreciseDuration(result.summary.audioDurationSeconds)} audio • ${result.summary.wordsPerMinute.toFixed(1)} WPM`,
                    `Ajusté à ${result.playbackPlan.playbackRate.toFixed(3)}× : ${context.services.formatPreciseDuration(result.summary.audioDurationSeconds)} d’audio • ${result.summary.wordsPerMinute.toFixed(1)} mots/min`
                );

                const outcome = context.platform.document.createElement("div");
                outcome.className = "small-note timing-test-result-outcome";
                if (result.summary.overrunSeconds > 0) {
                    outcome.style.color = "#a33a2b";
                    outcome.textContent = context.services.l(
                        `Adjusted clock: ${context.services.formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${context.services.formatPreciseDuration(result.summary.timerBudgetSeconds)} • ${context.services.formatPreciseDuration(result.summary.overrunSeconds)} over time`,
                        `Minuterie ajustée : ${context.services.formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${context.services.formatPreciseDuration(result.summary.timerBudgetSeconds)} • dépassement de ${context.services.formatPreciseDuration(result.summary.overrunSeconds)}`
                    );
                } else {
                    outcome.textContent = context.services.l(
                        `Adjusted clock: ${context.services.formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${context.services.formatPreciseDuration(result.summary.timerBudgetSeconds)} • ${context.services.formatPreciseDuration(result.summary.remainingSeconds)} left`,
                        `Minuterie ajustée : ${context.services.formatPreciseDuration(result.summary.timerConsumedSeconds)} / ${context.services.formatPreciseDuration(result.summary.timerBudgetSeconds)} • ${context.services.formatPreciseDuration(result.summary.remainingSeconds)} restant`
                    );
                }

                const technical = context.platform.document.createElement("div");
                technical.className = "small-note";
                technical.textContent = context.services.l(
                    `${result.summary.wordCount} words • ${result.chunkCount} audio chunks • calculated without playback`,
                    `${result.summary.wordCount} mots • ${result.chunkCount} segments audio • calculé sans lecture`
                );

                const playButton = context.platform.document.createElement("button");
                playButton.type = "button";
                playButton.className = "secondary-btn timing-test-preview-button";
                const previewActive = context.state.timingPreviewTranscriptIndex === result.transcriptIndex;
                playButton.textContent = previewActive
                    ? context.services.l("Stop preview", "Arrêter l’aperçu")
                    : context.services.l(`Play adjusted speech (${result.playbackPlan.playbackRate.toFixed(3)}×)`, `Lire la prise de parole ajustée (${result.playbackPlan.playbackRate.toFixed(3)}×)`);
                playButton.disabled = !result.audioChunks?.some((chunk) => !!chunk.audioUrl);
                playButton.addEventListener("click", () => { void playTimingTestResult(result); });

                card.append(title, metrics, adjustedMetrics, outcome, technical, playButton);
                context.ui.timingTestResultsEl.appendChild(card);
            });
        }

        function refreshTimingTestUi() {
            if (!context.ui.timingTestPanelEl) return;
            context.platform.document.body.classList.toggle("timing-test-mode", context.settings.TIMING_TEST_MODE);
            context.ui.timingTestPanelEl.hidden = !context.settings.TIMING_TEST_MODE;
            context.ui.timingTestPanelEl.style.display = context.settings.TIMING_TEST_MODE ? "" : "none";
            if (!context.settings.TIMING_TEST_MODE) return;
            renderTimingTestResults();
        }

        function timingTestResultLimitReached() {
            return context.settings.TIMING_TEST_RESULT_LIMIT > 0
                && context.state.timingTestResults.length >= context.settings.TIMING_TEST_RESULT_LIMIT;
        }
        return Object.freeze({getTimingTestFastForwardForMessage,ensureTimingPreviewAudioEl,stopTimingTestPreview,revokeTimingTestAudioChunks,clearTimingTestAudioCache,playTimingTestResult,renderTimingTestResults,refreshTimingTestUi,timingTestResultLimitReached});
    }
    return Object.freeze({create,dependencies});
});
