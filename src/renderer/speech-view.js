(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["speech-view"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["callTimeForCurrentPhase", "ensureComposerModeIndicatorUi", "getCurrentPhase", "l", "stopSpeechPlayback", "updateComposerModeIndicator"], "settings": [], "ui": ["callTimeBtnEl", "composerFormEl", "nextActionBtnEl", "stopSpeechBtnEl", "timerControlButtonsEl"], "platform": ["document"]});
    function create(context) {
        function ensureSpeechAudioEl() {
            if (context.state.speechAudioEl && context.platform.document.body.contains(context.state.speechAudioEl)) return context.state.speechAudioEl;
            const audioEl = context.platform.document.createElement("audio");
            audioEl.preload = "auto";
            audioEl.defaultPlaybackRate = 1;
            audioEl.playbackRate = 1;
            if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
            if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
            audioEl.hidden = true;
            audioEl.setAttribute("aria-hidden", "true");
            context.platform.document.body.appendChild(audioEl);
            context.state.speechAudioEl = audioEl;
            return audioEl;
        }


        function isSpeechPlaybackActive() {
            const audioEl = context.state.speechAudioEl;
            const audioPlaying = !!(audioEl && audioEl.src && typeof audioEl.paused === "boolean" && !audioEl.paused);
            return context.state.speechProcessing || context.state.speechPlaybackActive || !!context.state.speechQueue.length || !!context.state.wholeSpeechPendingTranscriptIndexes.size || !!context.state.currentSpeechController || !!context.state.openAiSpeechLookaheadPromise || !!context.state.openAiSpeechLookaheadPrepared || audioPlaying;
        }


        function refreshSpeechUi() {
            if (!context.ui.stopSpeechBtnEl) return;
            context.ui.stopSpeechBtnEl.disabled = !isSpeechPlaybackActive();
            context.ui.stopSpeechBtnEl.textContent = context.services.l("Stop Reading", "Arrêter la lecture");
            const audio = context.state.speechAudioEl;
            if (audio && audio.dataset.composerStatusBound !== "1") {
                audio.dataset.composerStatusBound = "1";
                ["playing", "pause", "ended", "error"].forEach(event => audio.addEventListener(event, context.services.updateComposerModeIndicator));
            }
            context.services.updateComposerModeIndicator();
        }


        function ensureSpeechUi() {
            if (!context.ui.callTimeBtnEl) {
                context.ui.callTimeBtnEl = context.platform.document.createElement("button");
                context.ui.callTimeBtnEl.id = "callTimeBtn";
                context.ui.callTimeBtnEl.type = "button";
                context.ui.callTimeBtnEl.className = "secondary-btn";
                context.ui.callTimeBtnEl.textContent = context.services.l("Call Time", "Annoncer la fin du temps");
                context.ui.timerControlButtonsEl?.parentElement?.appendChild(context.ui.callTimeBtnEl);
                context.ui.callTimeBtnEl.addEventListener("click", context.services.callTimeForCurrentPhase);
            }
            const timedPhase = context.services.getCurrentPhase();
            context.ui.callTimeBtnEl.disabled = !context.state.started || context.state.completed || !context.state.phaseReady || !timedPhase?.duration || context.state.interruptedPhaseIds.has(timedPhase.id);
            context.ui.callTimeBtnEl.textContent = context.services.l("Call Time", "Annoncer la fin du temps");
            ensureSpeechAudioEl();
            context.services.ensureComposerModeIndicatorUi();
            if (!context.ui.stopSpeechBtnEl) {
                context.ui.stopSpeechBtnEl = context.platform.document.getElementById("stopSpeechBtn");
                if (!context.ui.stopSpeechBtnEl) {
                    context.ui.stopSpeechBtnEl = context.platform.document.createElement("button");
                    context.ui.stopSpeechBtnEl.type = "button";
                    context.ui.stopSpeechBtnEl.id = "stopSpeechBtn";
                    context.ui.stopSpeechBtnEl.className = "secondary-btn";
                    context.ui.stopSpeechBtnEl.textContent = context.services.l("Stop Reading", "Arrêter la lecture");
                    const host = context.ui.composerFormEl?.querySelector(".composer-row") || context.ui.nextActionBtnEl?.parentElement || context.ui.composerFormEl;
                    if (host) host.appendChild(context.ui.stopSpeechBtnEl);
                }
                context.ui.stopSpeechBtnEl.addEventListener("click", () => { context.services.stopSpeechPlayback(true); });
            }
            refreshSpeechUi();
        }
        return Object.freeze({ensureSpeechAudioEl,isSpeechPlaybackActive,refreshSpeechUi,ensureSpeechUi});
    }
    return Object.freeze({create,dependencies});
});
