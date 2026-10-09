(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["speech-view"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["canSkipCurrentSpeech", "skipCurrentSpeech", "ensureComposerModeIndicatorUi", "getCurrentPhase", "l", "stopSpeechPlayback", "updateComposerModeIndicator"], "settings": [], "ui": ["skipSpeechBtnEl", "composerFormEl", "nextActionBtnEl", "stopSpeechBtnEl", "timerControlButtonsEl"], "platform": ["document"]});
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


        function isParticipantSpeechProtected() {
            return context.state.transcript.some(message => ["ai", "ai-alt"].includes(message.kind)
                && message.substantive !== false && message.speechDeliveryState === "pending");
        }


        function stopSpeechFromControl() {
            // Check again at activation so a queued click cannot interrupt a
            // participant that started after the button was last refreshed.
            if (isParticipantSpeechProtected() || !isSpeechPlaybackActive()) return false;
            context.services.stopSpeechPlayback(true);
            return true;
        }


        function refreshSpeechUi() {
            if(context.ui.skipSpeechBtnEl){
                context.ui.skipSpeechBtnEl.disabled=!context.services.canSkipCurrentSpeech();
                context.ui.skipSpeechBtnEl.textContent=context.services.l("Skip speech", "Passer la lecture");
                context.ui.skipSpeechBtnEl.title=context.services.l("Skip this segment’s playback while preserving its time limit and transcript.", "Passer la lecture de ce segment en conservant sa limite de temps et sa transcription.");
            }
            if (!context.ui.stopSpeechBtnEl) return;
            const protectedSpeech = isParticipantSpeechProtected();
            context.ui.stopSpeechBtnEl.disabled = protectedSpeech || !isSpeechPlaybackActive();
            context.ui.stopSpeechBtnEl.textContent = context.services.l("Stop Reading", "Arrêter la lecture");
            context.ui.stopSpeechBtnEl.title = protectedSpeech
                ? context.services.l("Participant speeches continue until they finish or reach their time limit.", "Les interventions continuent jusqu’à leur fin ou à leur limite de temps.") : "";
            const audio = context.state.speechAudioEl;
            if (audio && audio.dataset.composerStatusBound !== "1") {
                audio.dataset.composerStatusBound = "1";
                ["playing", "pause", "ended", "error"].forEach(event => audio.addEventListener(event, context.services.updateComposerModeIndicator));
            }
            context.services.updateComposerModeIndicator();
        }


        function ensureSpeechUi() {
            if (!context.ui.skipSpeechBtnEl) {
                context.ui.skipSpeechBtnEl = context.platform.document.createElement("button");
                context.ui.skipSpeechBtnEl.id = "skipSpeechBtn";
                context.ui.skipSpeechBtnEl.type = "button";
                context.ui.skipSpeechBtnEl.className = "secondary-btn";
                context.ui.skipSpeechBtnEl.textContent = context.services.l("Skip speech", "Passer la lecture");
                context.ui.timerControlButtonsEl?.parentElement?.appendChild(context.ui.skipSpeechBtnEl);
                context.ui.skipSpeechBtnEl.addEventListener("click", context.services.skipCurrentSpeech);
            }
            context.ui.skipSpeechBtnEl.textContent = context.services.l("Skip speech", "Passer la lecture");
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
                context.ui.stopSpeechBtnEl.addEventListener("click", stopSpeechFromControl);
            }
            refreshSpeechUi();
        }
        return Object.freeze({ensureSpeechAudioEl,isSpeechPlaybackActive,isParticipantSpeechProtected,stopSpeechFromControl,refreshSpeechUi,ensureSpeechUi});
    }
    return Object.freeze({create,dependencies});
});
