(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["voice"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["blobToByteArray", "clearPendingVoiceSubmission", "combineDraftAndSpeech", "currentPhaseUsesMainComposer", "getAudioBridge", "getCurrentPhase", "getPendingVoiceSubmissionReason", "getPhaseById", "hasCredential", "isFrenchLocale", "isHumanJudgeQuestionPhase", "l", "normalizeSpeechText", "openApiKeyDialog", "refreshControls", "resolvePendingVoiceSubmission", "safeBridgeErrorMessage", "scrollLiveVoicePreviewToBottom", "setBusy", "setStatus", "stopSpeechPlayback", "syncActiveJudgeDraftFromMainComposer"], "settings": ["AUDIO_MODELS"], "ui": ["liveVoicePreviewEl", "liveVoiceWrapEl", "messageInputEl"], "platform": ["Blob", "MediaRecorder", "console", "navigator"]});
    function create(context) {
        function showLiveVoicePreview(text) {
            context.ui.liveVoiceWrapEl.hidden = false;
            context.ui.liveVoicePreviewEl.textContent = text || context.services.l("Listening...", "Écoute...");
            context.services.scrollLiveVoicePreviewToBottom();
        }


        function hideLiveVoicePreview() {
            context.ui.liveVoiceWrapEl.hidden = true;
            context.ui.liveVoicePreviewEl.textContent = "";
            context.ui.liveVoicePreviewEl.scrollTop = 0;
        }


        function resetLiveSpeechState() {
            context.state.draftBeforeRecording = "";
            hideLiveVoicePreview();
        }


        function resetVoiceCaptureState() {
            context.state.voiceFinalizePending = false;
        }


        function getVoiceComposerPhaseContext() {
            return context.services.getPhaseById(context.state.pendingVoiceSubmission?.phaseId || "") || context.services.getCurrentPhase();
        }


        function getVoiceResultStatus({ pendingSubmitReason = "" } = {}) {
            const phase = getVoiceComposerPhaseContext();
            const isJudgeQuestion = context.services.isHumanJudgeQuestionPhase(phase);
            const reviewPhrase = isJudgeQuestion
            ? context.services.l("Review it and press Ask when ready.", "Relisez et cliquez sur Poser la question quand vous êtes prête.")
            : context.services.l("Review it and press Send when ready.", "Relisez et cliquez sur Soumettre quand vous êtes prête.");
            if (pendingSubmitReason === "timeout") {
                return isJudgeQuestion
                ? context.services.l("Time is up. Finalizing the transcript and asking the question.", "Le temps est écoulé. Finalisation de la transcription et envoi de la question.")
                : context.services.l("Time is up. Finalizing the transcript and submitting it.", "Le temps est écoulé. Finalisation de la transcription et soumission.");
            }
            if (pendingSubmitReason === "manual") {
                return isJudgeQuestion
                ? context.services.l("Finalizing the transcript and asking the question now.", "Finalisation de la transcription et envoi de la question.")
                : context.services.l("Finalizing the transcript and submitting now.", "Finalisation de la transcription et soumission.");
            }
            return context.services.isFrenchLocale() ? `Texte vocal inséré. ${reviewPhrase}` : `Voice text inserted. ${reviewPhrase}`;
        }


        function applyVoiceInputResult(voiceText, statusText, options = {}) {
            const pending = context.state.pendingVoiceSubmission;
            const combined = context.services.combineDraftAndSpeech(pending?.awaitingVoice ? pending.recordingDraft : context.state.draftBeforeRecording, voiceText);
            if (pending?.awaitingVoice) pending.capturedDraft = combined;
            const { isError = false } = options;
            context.ui.messageInputEl.value = combined;
            context.services.syncActiveJudgeDraftFromMainComposer({ persist: true });
            context.services.setStatus(statusText, isError);
        }


        function hasUsableMediaStream(stream) {
            if (!stream || typeof stream.getAudioTracks !== "function") return false;
            const tracks = stream.getAudioTracks();
            if (!tracks.length) return false;
            return tracks.some((track) => track.readyState === "live");
        }


        function releaseMicrophoneStream() {
            if (!context.state.mediaStream) return;
            for (const track of context.state.mediaStream.getTracks()) {
                try { track.stop(); } catch {}
            }
            context.state.mediaStream = null;
        }


        async function ensureMicrophoneStream() {
            const runId = context.state.matchRunId;
            if (context.state.sessionClosed) return null;
            if (hasUsableMediaStream(context.state.mediaStream)) return context.state.mediaStream;
            releaseMicrophoneStream();
            const stream = await context.platform.navigator.mediaDevices.getUserMedia({ audio: true });
            if (context.state.sessionClosed || runId !== context.state.matchRunId) {
                for (const track of stream.getTracks()) track.stop();
                return null;
            }
            context.state.mediaStream = stream;
            return stream;
        }


        function cleanupRecorderDevices() {
            context.state.mediaRecorder = null;
            context.state.audioChunks = [];
            context.services.refreshControls();
        }


        function stopRecordingAndFinalize(statusText = context.services.l("Stopping recording...", "Arrêt de l’enregistrement...")) {
            if (!context.state.isRecording || !context.state.mediaRecorder) return false;
            context.state.voiceFinalizePending = true;
            context.state.isRecording = false;
            context.services.refreshControls();
            try {
                if (context.state.mediaRecorder.state !== "inactive") context.state.mediaRecorder.stop();
            } catch {}
            context.services.setStatus(statusText);
            return true;
        }


        async function transcribeAudio(blob) {
            const runId = context.state.matchRunId;
            if (context.state.sessionClosed) return;
            const requestId = ++context.state.finalTranscriptionRequestId;
            let finalText = "";
            let statusText = "";
            let isError = false;
            let restoreDraft = false;
            try {
                if (!blob || !blob.size) {
                    restoreDraft = true;
                    statusText = context.services.getPendingVoiceSubmissionReason() === "timeout" ? context.services.l("Time is up. No audio was captured.", "Le temps est écoulé. Aucun audio n’a été capté.") : context.services.l("No audio was captured.", "Aucun audio n’a été capté.");
                    isError = true;
                    return;
                }
                if (!context.services.hasCredential("openai")) {
                    context.services.openApiKeyDialog("openai");
                    restoreDraft = true;
                    statusText = context.services.l("An OpenAI API key is required for speech-to-text.", "Une clé API OpenAI est requise pour la transcription vocale.");
                    isError = true;
                    return;
                }
                context.services.setBusy(true);
                context.services.setStatus(context.services.l("Finalizing transcript...", "Finalisation de la transcription..."));
                const mime = blob.type || "audio/webm";
                const extension = mime.includes("ogg") ? "ogg" : "webm";
                const bytes = await context.services.blobToByteArray(blob);
                if (requestId !== context.state.finalTranscriptionRequestId || runId !== context.state.matchRunId || context.state.sessionClosed) return;
                const data = await context.services.getAudioBridge().transcribe({
                    bytes,
                    mimeType: mime,
                    fileName: `recording.${extension}`,
                    model: context.settings.AUDIO_MODELS.finalTranscription,
                    language: context.services.isFrenchLocale() ? "fr" : "en"
                });
                if (requestId !== context.state.finalTranscriptionRequestId || runId !== context.state.matchRunId || context.state.sessionClosed) return;
                finalText = context.services.normalizeSpeechText(data?.text || "");
                if (!finalText) throw new Error(context.services.l("No speech was detected.", "Aucune parole n’a été détectée."));
                statusText = getVoiceResultStatus({ pendingSubmitReason: context.services.getPendingVoiceSubmissionReason() });
            } catch (error) {
                context.platform.console.error("Transcription failed:", error);
                restoreDraft = true;
                statusText = context.services.safeBridgeErrorMessage(error) || context.services.l("Transcription failed.", "La transcription a échoué.");
                isError = true;
            } finally {
                if (requestId !== context.state.finalTranscriptionRequestId || runId !== context.state.matchRunId || context.state.sessionClosed) return;
                if (finalText) {
                    applyVoiceInputResult(finalText, statusText, { isError });
                } else if (restoreDraft) {
                    context.ui.messageInputEl.value = context.state.draftBeforeRecording;
                    context.services.syncActiveJudgeDraftFromMainComposer({ persist: true });
                    context.services.setStatus(statusText, isError);
                } else if (statusText) {
                    context.services.setStatus(statusText, isError);
                }
                const shouldResolvePendingSubmission = !!context.state.pendingVoiceSubmission;
                resetLiveSpeechState();
                resetVoiceCaptureState();
                context.services.setBusy(false);
                context.services.refreshControls();
                if (shouldResolvePendingSubmission) context.services.resolvePendingVoiceSubmission();
                else context.ui.messageInputEl.focus();
            }
        }


        async function toggleRecording() {
            const runId = context.state.matchRunId;
            if (context.state.sessionClosed) return;
            const phase = context.services.getCurrentPhase();
            const composerActive = context.services.currentPhaseUsesMainComposer(phase);
            if (!composerActive && !context.state.isRecording) {
                context.services.setStatus(context.services.l("Voice input is only available during active human-controlled turns and active human judge question phases.", "La saisie vocale n’est disponible que pendant les tours humains actifs et les phases actives de question des juges humains."), true);
                return;
            }
            if ((context.state.busy || context.state.voiceFinalizePending) && !context.state.isRecording) return;

            if (context.state.isRecording && context.state.mediaRecorder) {
                stopRecordingAndFinalize(context.services.l("Stopping recording...", "Arrêt de l’enregistrement..."));
                return;
            }
            if (!context.platform.navigator.mediaDevices || typeof context.platform.MediaRecorder === "undefined") {
                context.services.setStatus(context.services.l("Audio recording is not supported in this browser.", "L’enregistrement audio n’est pas pris en charge dans ce navigateur."), true);
                return;
            }
            if (!context.services.hasCredential("openai")) {
                context.services.openApiKeyDialog("openai");
                context.services.setStatus(context.services.l("An OpenAI API key is required for speech-to-text.", "Une clé API OpenAI est requise pour la transcription vocale."), true);
                return;
            }
            try {
                context.services.stopSpeechPlayback(false);
                resetVoiceCaptureState();
                const stream = await ensureMicrophoneStream();
                if (!stream || context.state.sessionClosed || runId !== context.state.matchRunId) return;
                const preferredMimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => {
                    try { return context.platform.MediaRecorder.isTypeSupported(type); } catch { return false; }
                });
                const recorder = preferredMimeType ? new context.platform.MediaRecorder(stream, { mimeType: preferredMimeType }) : new context.platform.MediaRecorder(stream);
                const isCurrent = () => context.state.mediaRecorder === recorder && runId === context.state.matchRunId && !context.state.sessionClosed;
                context.state.mediaRecorder = recorder;
                context.state.audioChunks = [];
                context.state.draftBeforeRecording = String(context.ui.messageInputEl.value || "").trim();
                context.state.voiceFinalizePending = false;
                context.state.isRecording = true;
                showLiveVoicePreview(context.services.l("Recording audio...", "Enregistrement audio..."));
                context.services.refreshControls();

                recorder.ondataavailable = (event) => {
                    if (!isCurrent()) return;
                    if (event.data && event.data.size) context.state.audioChunks.push(event.data);
                };

                    recorder.onerror = () => {
                        if (!isCurrent()) return;
                        context.state.isRecording = false;
                        cleanupRecorderDevices();
                        resetLiveSpeechState();
                        resetVoiceCaptureState();
                        context.services.clearPendingVoiceSubmission();
                        releaseMicrophoneStream();
                        context.services.setStatus(context.services.l("Recording failed.", "L’enregistrement a échoué."), true);
                    };

                    recorder.onstop = async () => {
                        if (!isCurrent()) return;
                        const blob = new context.platform.Blob(context.state.audioChunks, { type: recorder.mimeType || "audio/webm" });
                        cleanupRecorderDevices();
                        await transcribeAudio(blob);
                    };

                    recorder.start(250);
                    context.services.setStatus(context.services.l("Recording... OpenAI will transcribe once when you stop or submit.", "Enregistrement... OpenAI transcrira une seule fois à l’arrêt ou à la soumission."));
            } catch (error) {
                if (context.state.sessionClosed || runId !== context.state.matchRunId) return;
                context.platform.console.error("Microphone error:", error);
                context.state.isRecording = false;
                cleanupRecorderDevices();
                resetLiveSpeechState();
                resetVoiceCaptureState();
                context.services.clearPendingVoiceSubmission();
                releaseMicrophoneStream();
                context.services.setStatus(context.services.l("Microphone access failed or was denied.", "L’accès au microphone a échoué ou a été refusé."), true);
            }
        }
        return Object.freeze({showLiveVoicePreview,hideLiveVoicePreview,resetLiveSpeechState,resetVoiceCaptureState,getVoiceComposerPhaseContext,getVoiceResultStatus,applyVoiceInputResult,hasUsableMediaStream,releaseMicrophoneStream,ensureMicrophoneStream,cleanupRecorderDevices,stopRecordingAndFinalize,transcribeAudio,toggleRecording});
    }
    return Object.freeze({create,dependencies});
});
