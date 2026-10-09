(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["speech"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["beginSpeechProgressForQueueEntry", "clearTimingTestAudioCache", "countWords", "ensureSpeechAudioEl", "ensureSpeechUi", "finalizeAllSpeechPlaybackCallbacks", "finalizeSpeechPlaybackForMessage", "finishSpeechProgressPlayback", "formatClock", "formatPreciseDuration", "getCurrentPhase", "getJudgeModel", "getParticipantModel", "getPhaseById", "getTimingTestFastForwardForMessage", "hasCredential", "invokeSpeechStartCallbacks", "isAiControlledRole", "isFrenchLocale", "l", "markSpeechChunkComplete", "messageKindForRole", "normalizeSpeechText", "queueSpeechFollowScroll", "refreshSpeechUi", "renderTimingTestResults", "renderTranscript", "resetSpeechProgressState", "restoreMessageBodyPlainText", "syncSpeechProgressToUi", "revokeTimingTestAudioChunks", "safeBridgeErrorMessage", "sanitizeText", "setStatus", "stopTimer", "trackSpeechChunksForMessage", "updateComposerModeIndicator", "waitMs"], "settings": ["AI_TURN_PROMPTS", "AUDIO_MODELS", "AUTO_SPEAK_MESSAGE_KINDS", "AUTO_SPEAK_VOICES", "MAX_TTS_CHARS", "MODEL_CATALOG", "MODERATOR_SPEECH_INSTRUCTIONS", "SPEECH_CHUNK_MAX", "SPEECH_DELIVERY", "SPEECH_TIMING", "STOP_SPEECH_ERROR", "TIMED_SPEECH_TIMER_LEAD_MS", "TIMING_TEST_MODE", "TIMING_TEST_TTS_CONCURRENCY", "WHOLE_SPEECH_MAX_PLAYBACK_RATE", "WHOLE_SPEECH_MIN_PLAYBACK_RATE", "WHOLE_SPEECH_TTS_CONCURRENCY"], "ui": ["timerDisplayEl", "timerHintEl"], "platform": ["AbortController", "Blob", "URL", "console", "window"]});
    function create(context) {
        const participantSpeechInstructions = "Keep one consistent speaker identity, vocal register, pitch range, accent, and natural measured cadence throughout this speech. Use the selected voice without changing character or delivery style between paragraphs. Preserve the supplied wording exactly.";
        function rejectCurrentSpeechPlayback() {
            if (typeof context.state.currentSpeechReject === "function") {
                const reject = context.state.currentSpeechReject;
                context.state.currentSpeechReject = null;
                try { reject(new Error(context.settings.STOP_SPEECH_ERROR)); } catch {}
            }
        }


        function resetSpeechAudioEl() {
            const audioEl = context.services.ensureSpeechAudioEl();
            try {
                audioEl.pause();
                audioEl.currentTime = 0;
                audioEl.defaultPlaybackRate = 1;
                audioEl.playbackRate = 1;
            } catch {}
            audioEl.onplaying = null;
            audioEl.ontimeupdate = null;
            audioEl.onended = null;
            audioEl.onerror = null;
            audioEl.onpause = null;
            if (context.state.currentAudioUrl) {
                try { context.platform.URL.revokeObjectURL(context.state.currentAudioUrl); } catch {}
                context.state.currentAudioUrl = "";
            }
            audioEl.removeAttribute("src");
            try { audioEl.load(); } catch {}
        }


        function revokeQueuedPreparedSpeechAudio(entries = context.state.speechQueue) {
            (entries || []).forEach((entry) => {
                if (!entry?.preparedAudio?.audioUrl) return;
                try { context.platform.URL.revokeObjectURL(entry.preparedAudio.audioUrl); } catch {}
                entry.preparedAudio = null;
            });
        }


        function clearOpenAiSpeechLookahead() {
            if (context.state.currentSpeechController && context.state.currentSpeechControllerKind === "lookahead") {
                try { context.state.currentSpeechController.abort(); } catch {}
            }
            const preparedUrl = context.state.openAiSpeechLookaheadPrepared?.audioUrl || "";
            if (preparedUrl) {
                try { context.platform.URL.revokeObjectURL(preparedUrl); } catch {}
            }
            context.state.openAiSpeechLookaheadPromise = null;
            context.state.openAiSpeechLookaheadPrepared = null;
            context.state.openAiSpeechLookaheadEntry = null;
            if (context.state.currentSpeechControllerKind === "lookahead") context.state.currentSpeechControllerKind = "";
            context.services.refreshSpeechUi();
        }


        function stopSpeechPlayback(showMessage = false, { resolveCallbacks = true, deliveryReason = "stopped" } = {}) {
            captureActiveSpeechDelivery();
            const teardown = deliveryReason === "reset" || deliveryReason === "closed";
            const capturedRunId = context.state.currentDeliveryPlayback?.runId ?? context.state.matchRunId;
            const capturedDeliveryText = context.state.currentDeliveryPlayback?.message?.text || "";
            if (deliveryReason === "closed" && !context.state.sessionClosed) {
                context.state.sessionClosed = true;
                context.state.matchRunId += 1;
                context.state.finalTranscriptionRequestId += 1;
            }
            let interruptedSubstantiveSpeech = false;
            let cutoffPromise=Promise.resolve();
            const stoppedRunId=context.state.matchRunId;
            for (const message of context.state.transcript || []) {
                if (message.speechDeliveryState === "pending" || (teardown && message.speechDeliveryState === "transcribing")) {
                    const active = context.state.currentDeliveryPlayback;
                    if (teardown || deliveryReason === "error") context.settings.SPEECH_DELIVERY.sealUnresolved(message);
                    else {
                        context.settings.SPEECH_DELIVERY.beginSpokenCutoff(message);
                        const prepared=active?.message===message?context.state.currentSpeechRecordPlayback:null;
                        const through=prepared?Math.min(active.audio.currentTime,context.settings.SPEECH_DELIVERY.playedThrough(active.audio)):0;
                        if(!prepared || through<=.01)context.settings.SPEECH_DELIVERY.finalizeSpokenCutoff(message,"");
                        else cutoffPromise=finalizeActualAudioCutoff(message,prepared,through,stoppedRunId);
                    }
                    interruptedSubstantiveSpeech = true;
                }
            }
            if (interruptedSubstantiveSpeech) {
                context.state.aiFinalJudgeScorecards = {};
                context.state.aiFinalJudgeScoringTranscripts = {};
                context.state.aiFinalJudgeScoringPromises = {};
                context.state.aiFinalJudgeScoringErrors = {};
            }
            const stoppedRecord=context.state.currentSpeechRecordPlayback;
            if(stoppedRecord){const audio=context.state.speechAudioEl,message=context.state.transcript[stoppedRecord.entry?.transcriptIndex];saveSpeechRecordNotice("playback_stopped",stoppedRecord,{reason:deliveryReason,matchRunId:capturedRunId,capturedPrefix:capturedDeliveryText,mediaTime:audio?.currentTime||0,playedThrough:context.settings.SPEECH_DELIVERY.playedThrough(audio),wallMilliseconds:Date.now()-(stoppedRecord.playbackWallStart||Date.now()),deliveredPrefix:message?.text||"",deliveryState:message?.speechDeliveryState||"",timerRemaining:context.state.timer.remaining});}
            context.state.currentDeliveryPlayback = null;
            context.state.speechToken += 1;
            revokeQueuedPreparedSpeechAudio();
            context.state.speechQueue = [];
            context.state.wholeSpeechPendingTranscriptIndexes.clear();
            clearAllWholeSpeechPreparations();
            context.state.speechProcessing = false;
            clearOpenAiSpeechLookahead();
            context.state.speechPlaybackActive = false;
            context.state.lastSpeechEndedAtMs = 0;
            context.services.clearTimingTestAudioCache();
            context.state.timingTestMeasurements.clear();
            rejectCurrentSpeechPlayback();
            if (context.state.currentSpeechController) {
                try { context.state.currentSpeechController.abort(); } catch {}
                context.state.currentSpeechController = null;
            }
            context.state.currentSpeechControllerKind = "";
            resetSpeechAudioEl();
            context.services.resetSpeechProgressState({ clearUi: true });
            if (resolveCallbacks) context.services.finalizeAllSpeechPlaybackCallbacks();
            else {
                context.state.speechChunkCounts.clear();
                context.state.speechStartCallbacks.clear();
                context.state.speechCompletionCallbacks.clear();
            }
            context.services.refreshSpeechUi();
            if (teardown) { context.state.spokenAudioCutoffRetry = null; context.state.spokenAudioTranscriptionPending = false; }
            if (showMessage) context.services.setStatus(context.services.l("Read-aloud stopped.", "Lecture arrêtée."));
            void cutoffPromise.catch(()=>{});
            return cutoffPromise;
        }


        function splitTextByWords(text, maxLen = context.settings.SPEECH_CHUNK_MAX) {
            const normalized = context.services.normalizeSpeechText(text);
            if (!normalized) return [];
            const words = normalized.split(" ");
            const chunks = [];
            let current = "";
            for (const word of words) {
                const candidate = current ? `${current} ${word}` : word;
                if (candidate.length > maxLen && current) {
                    chunks.push(current);
                    current = word;
                } else {
                    current = candidate;
                }
            }
            if (current) chunks.push(current);
            return chunks;
        }


        function chunkTextForSpeech(text, maxLen = context.settings.SPEECH_CHUNK_MAX) {
            const normalized = context.services.normalizeSpeechText(text);
            if (!normalized) return [];
            const segments = normalized
            .split(/(?<=[.!?…]["')\]]?)\s+|\n{2,}/)
            .map((item) => context.services.normalizeSpeechText(item))
            .filter(Boolean);
            if (segments.length <= 1) return splitTextByWords(normalized, maxLen);
            const chunks = [];
            let current = "";
            for (const segment of segments) {
                if (segment.length > maxLen) {
                    if (current) { chunks.push(current); current = ""; }
                    chunks.push(...splitTextByWords(segment, maxLen));
                    continue;
                }
                const candidate = current ? `${current} ${segment}` : segment;
                if (candidate.length > maxLen && current) {
                    chunks.push(current);
                    current = segment;
                } else {
                    current = candidate;
                }
            }
            if (current) chunks.push(current);
            return chunks;
        }


        function buildSpeechQueueEntries(kind, text, transcriptIndex = -1, voiceKey = "", options = {}) {
            const normalized = context.services.normalizeSpeechText(text);
            if (!normalized) return [];
            const speechStartLeadMs = Math.max(0, Math.min(3000, Number(options.speechStartLeadMs) || 0));
            const minimumHandoffGapMs = Math.max(0, Math.min(3000, Number(options.minimumHandoffGapMs) || 0));
            const chunkLimit = ["ai", "ai-alt"].includes(kind) ? context.settings.MAX_TTS_CHARS : context.settings.SPEECH_CHUNK_MAX;
            const speechTextChunks = chunkTextForSpeech(normalized, chunkLimit)
            .map((textChunk) => {
                if (textChunk.length > context.settings.MAX_TTS_CHARS) throw new Error(context.services.l(`Read-aloud contains an unbroken segment longer than ${context.settings.MAX_TTS_CHARS} characters. Add spaces or punctuation to that segment; nothing was clipped.`, `La lecture contient un segment sans coupure de plus de ${context.settings.MAX_TTS_CHARS} caractères. Ajoutez des espaces ou de la ponctuation; aucun texte n’a été tronqué.`));
                return textChunk;
            })
            .filter(Boolean);
            return speechTextChunks.map((textChunk, chunkIndex) => ({
                kind,
                voiceKey: voiceKey || kind,
                text: textChunk,
                originalText: String(text || ""),
                transcriptIndex,
                chunkIndex,
                chunkCount: speechTextChunks.length,
                speechStartLeadMs: chunkIndex === 0 ? speechStartLeadMs : 0,
                minimumHandoffGapMs: chunkIndex === 0 ? minimumHandoffGapMs : 0,
                phaseId: options.phaseId || ""
            }));
        }


        function ensureSentenceEnding(text, ending = ".") {
            const normalized = context.services.normalizeSpeechText(text);
            if (!normalized || /[.!?…]["')\]]*$/u.test(normalized)) return normalized;
            return `${normalized}${String(ending || ".").charAt(0) || "."}`;
        }


        function getAudioBridge() {
            const bridge = context.platform.window.ethicsApi?.audio;
            if (!bridge || typeof bridge.speech !== "function" || typeof bridge.transcribe !== "function") {
                throw new Error(context.services.l("The desktop audio bridge is unavailable.", "Le pont audio de l’application de bureau n’est pas disponible."));
            }
            return bridge;
        }


        function toUint8Array(bytes) {
            if (bytes instanceof Uint8Array) return bytes;
            if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
            if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return new Uint8Array(Array.isArray(bytes) ? bytes : []);
        }


        async function blobToByteArray(blob) {
            return new Uint8Array(await blob.arrayBuffer());
        }


        async function decodeSpeechAudioDuration(audioBytes, audioUrl) {
            const bytes = toUint8Array(audioBytes);
            if (!bytes.byteLength) throw new Error("Cannot measure empty speech audio.");
            const AudioContextClass = context.platform.window.AudioContext || context.platform.window.webkitAudioContext;
            let decodeError = null;

            if (AudioContextClass) {
                try {
                    if (!context.state.timingTestAudioContext || context.state.timingTestAudioContext.state === "closed") {
                        context.state.timingTestAudioContext = new AudioContextClass();
                    }
                    const copiedBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
                    const decoded = await context.state.timingTestAudioContext.decodeAudioData(copiedBuffer);
                    if (Number.isFinite(decoded?.duration) && decoded.duration > 0) {
                        return { durationSeconds: decoded.duration, method: "decoded-pcm" };
                    }
                    throw new Error("Decoded speech audio had no measurable duration.");
                } catch (error) {
                    decodeError = error;
                }
            }

            if (!audioUrl) throw decodeError || new Error("Speech audio duration could not be decoded.");
            return new Promise((resolve, reject) => {
                const probe = new Audio();
                let settled = false;
                const timeoutId = context.platform.window.setTimeout(() => finish(null, new Error("Speech audio metadata timing timed out.")), 10000);
                const cleanup = () => {
                    context.platform.window.clearTimeout(timeoutId);
                    probe.onloadedmetadata = null;
                    probe.ondurationchange = null;
                    probe.onerror = null;
                    probe.removeAttribute("src");
                    try { probe.load(); } catch {}
                };
                const finish = (durationSeconds, error = null) => {
                    if (settled) return;
                    if (!error && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) return;
                    settled = true;
                    cleanup();
                    if (error) reject(error);
                    else resolve({ durationSeconds, method: "media-metadata" });
                };
                const readDuration = () => finish(probe.duration);
                probe.preload = "metadata";
                probe.onloadedmetadata = readDuration;
                probe.ondurationchange = readDuration;
                probe.onerror = () => finish(null, decodeError || new Error("Speech audio duration could not be measured."));
                probe.src = audioUrl;
                try { probe.load(); } catch (error) { finish(null, decodeError || error); }
            });
        }


        function getWholeSpeechDescriptorForPhase(phase) {
            if (!phase || !context.settings.SPEECH_TIMING.isTimedSpokenPhase(phase)) return null;
            if ((phase.kind === "speech" || phase.kind === "judgeAnswer") && context.services.isAiControlledRole(phase.speaker)) {
                const kind = context.services.messageKindForRole(phase.speaker);
                return { kind, voiceKey: kind };
            }
            return null;
        }


        function wholeSpeechPreparationMatches(record, phase, text, descriptor) {
            return !!record
                && record.phaseId === phase?.id
                && record.matchRunId === context.state.matchRunId
                && record.text === context.services.normalizeSpeechText(text)
                && record.kind === descriptor?.kind
                && record.voiceKey === descriptor?.voiceKey;
        }


        function releaseWholeSpeechPreparation(record) {
            if (!record || record.consumed || record.released) return;
            record.released = true;
            (record.preparedChunks || []).forEach((item) => revokePreparedSpeechAudio(item?.prepared));
            record.preparedChunks = [];
        }


        function clearWholeSpeechPreparation(phaseId) {
            const record = context.state.wholeSpeechPreparations.get(phaseId);
            if (!record) return;
            context.state.wholeSpeechPreparations.delete(phaseId);
            releaseWholeSpeechPreparation(record);
        }


        function clearAllWholeSpeechPreparations() {
            const records = [...context.state.wholeSpeechPreparations.values()];
            context.state.wholeSpeechPreparations.clear();
            records.forEach(releaseWholeSpeechPreparation);
        }


        function prepareWholeSpeechAudioForPhase(phase, text, descriptor = getWholeSpeechDescriptorForPhase(phase)) {
            const normalized = context.services.normalizeSpeechText(text);
            if (context.state.sessionClosed || context.settings.TIMING_TEST_MODE || !phase?.id || !phase.duration || !normalized || !descriptor) return Promise.resolve(null);
            const existing = context.state.wholeSpeechPreparations.get(phase.id);
            if (wholeSpeechPreparationMatches(existing, phase, normalized, descriptor)) return existing.promise;
            if (existing) clearWholeSpeechPreparation(phase.id);

            const matchRunId = context.state.matchRunId;
            const speechToken = context.state.speechToken;
            const entries = buildSpeechQueueEntries(descriptor.kind, text, -1, descriptor.voiceKey, {
                speechStartLeadMs: context.settings.TIMED_SPEECH_TIMER_LEAD_MS,
                phaseId: phase.id
            });
            if (!entries.length) return Promise.resolve(null);

            const record = {
                phaseId: phase.id,
                matchRunId,
                text: normalized,
                kind: descriptor.kind,
                voiceKey: descriptor.voiceKey,
                entries,
                preparedChunks: [],
                totalAudioDurationSeconds: 0,
                plan: null,
                consumed: false,
                released: false,
                promise: null
            };
            context.state.wholeSpeechPreparations.set(phase.id, record);

            record.promise = (async () => {
                let results = [];
                try {
                    results = await context.settings.SPEECH_TIMING.mapWithConcurrency(
                        entries,
                        context.settings.WHOLE_SPEECH_TTS_CONCURRENCY,
                        async (entry) => {
                            let prepared = null;
                            try {
                                prepared = await fetchOpenAiSpeechAudio(entry, speechToken, {
                                    controllerKind: "whole-speech-preload",
                                    trackController: false
                                });
                                if (!prepared) return { entry, cancelled: true };
                                const decodedTiming = prepared.decodedTiming || await decodeSpeechAudioDuration(prepared.audioBytes, prepared.audioUrl);
                                return { entry, prepared, decodedTiming };
                            } catch (error) {
                                return { entry, prepared, error };
                            }
                        }
                    );

                    const isCurrent = context.state.wholeSpeechPreparations.get(phase.id) === record
                        && matchRunId === context.state.matchRunId
                        && speechToken === context.state.speechToken;
                    const failed = results.find((result) => result.error);
                    if (!isCurrent || results.some((result) => result.cancelled)) {
                        results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                        return null;
                    }
                    if (failed) {
                        results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                        throw failed.error;
                    }

                    record.preparedChunks = results;
                    record.totalAudioDurationSeconds = results.reduce(
                        (total, result) => total + Math.max(0, Number(result.decodedTiming?.durationSeconds) || 0),
                        0
                    );
                    record.plan = context.settings.SPEECH_TIMING.planWholeSpeechPlayback({
                        audioDurationSeconds: record.totalAudioDurationSeconds,
                        timerLeadMs: context.settings.TIMED_SPEECH_TIMER_LEAD_MS,
                        timerBudgetSeconds: phase.duration,
                        minimumPlaybackRate: context.settings.WHOLE_SPEECH_MIN_PLAYBACK_RATE,
                        maximumPlaybackRate: context.settings.WHOLE_SPEECH_MAX_PLAYBACK_RATE
                    });
                    await saveSpeechRecord("speech_plan",results[0]?.prepared,{phaseId:phase.id,originalText:String(text),actualWords:context.services.countWords(text),naturalTotalAudioSeconds:record.totalAudioDurationSeconds,plan:record.plan});
                    context.platform.console.info(`[speech-rate-plan] ${JSON.stringify({
                        phaseId: phase.id,
                        naturalAudioSeconds: Number(record.totalAudioDurationSeconds.toFixed(2)),
                        playbackRate: Number(record.plan.playbackRate.toFixed(4)),
                        projectedClockSeconds: Number(record.plan.projectedTimerConsumedSeconds.toFixed(2))
                    })}`);
                    return record;
                } catch (error) {
                    results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                    if (context.state.wholeSpeechPreparations.get(phase.id) === record) {
                        context.state.wholeSpeechPreparations.delete(phase.id);
                    }
                    throw error;
                }
            })();
            return record.promise;
        }


        function primeWholeSpeechAudioForPhase(phase, text) {
            const descriptor = getWholeSpeechDescriptorForPhase(phase);
            if (!descriptor) return;
            void prepareWholeSpeechAudioForPhase(phase, text, descriptor).catch((error) => {
                context.platform.console.warn(`Whole-speech audio preparation failed for ${phase.id}; playback will retry.`, error);
            });
        }


        function recordTimingTestSpeechChunk(prepared, decodedTiming) {
            if (!context.settings.TIMING_TEST_MODE || !prepared?.entry || !decodedTiming) return null;
            const entry = prepared.entry;
            const transcriptIndex = Number(entry.transcriptIndex);
            if (!Number.isInteger(transcriptIndex) || transcriptIndex < 0) return null;
            const chunkCount = Math.max(1, Math.round(Number(entry.chunkCount) || 1));
            let measurement = context.state.timingTestMeasurements.get(transcriptIndex);
            if (!measurement) {
                measurement = {
                    transcriptIndex,
                    chunkCount,
                    measuredChunks: 0,
                    audioDurationSeconds: 0,
                    timerLeadMs: 0,
                    decodeMethods: new Set(),
                    audioChunks: new Array(chunkCount),
                    fastForwarded: context.services.getTimingTestFastForwardForMessage(transcriptIndex)
                };
                context.state.timingTestMeasurements.set(transcriptIndex, measurement);
            }

            measurement.measuredChunks += 1;
            measurement.audioDurationSeconds += decodedTiming.durationSeconds;
            measurement.timerLeadMs += Math.max(0, Number(entry.speechStartLeadMs) || 0);
            measurement.decodeMethods.add(decodedTiming.method);
            const chunkIndex = Math.max(0, Math.min(chunkCount - 1, Math.round(Number(entry.chunkIndex) || 0)));
            measurement.audioChunks[chunkIndex] = {
                audioUrl: prepared.audioUrl,
                mimeType: prepared.mimeType,
                text: entry.text
            };
            prepared.retainedForTimingPreview = true;
            if (measurement.measuredChunks < measurement.chunkCount) return null;

            context.state.timingTestMeasurements.delete(transcriptIndex);
            const message = context.state.transcript[transcriptIndex] || {};
            const phase = context.services.getPhaseById(message.phaseId);
            if (!context.settings.SPEECH_TIMING.shouldReportTimedMessage(message, phase)) {
                context.services.revokeTimingTestAudioChunks(measurement.audioChunks);
                return null;
            }

            const wordCount = context.settings.SPEECH_DELIVERY.has(message) ? context.settings.SPEECH_DELIVERY.wordCount(message) : context.services.countWords(message.text);
            const naturalSummary = context.settings.SPEECH_TIMING.summarizeTimedSpeech({
                audioDurationSeconds: measurement.audioDurationSeconds,
                timerLeadMs: measurement.timerLeadMs,
                timerBudgetSeconds: phase.duration,
                wordCount
            });
            const playbackPlan = context.settings.SPEECH_TIMING.planWholeSpeechPlayback({
                audioDurationSeconds: measurement.audioDurationSeconds,
                timerLeadMs: measurement.timerLeadMs,
                timerBudgetSeconds: phase.duration,
                minimumPlaybackRate: context.settings.WHOLE_SPEECH_MIN_PLAYBACK_RATE,
                maximumPlaybackRate: context.settings.WHOLE_SPEECH_MAX_PLAYBACK_RATE
            });
            const adjustedSummary = context.settings.SPEECH_TIMING.summarizeTimedSpeech({
                audioDurationSeconds: playbackPlan.projectedPlaybackSeconds,
                timerLeadMs: measurement.timerLeadMs,
                timerBudgetSeconds: phase.duration,
                wordCount
            });

            const result = {
                transcriptIndex,
                phaseId: phase.id,
                phaseTitle: phase.title,
                label: message.label || context.services.l("Speaker", "Oratrice"),
                chunkCount: measurement.chunkCount,
                decodeMethods: [...measurement.decodeMethods],
                audioChunks: measurement.audioChunks,
                fastForwarded: measurement.fastForwarded,
                naturalSummary,
                playbackPlan,
                summary: adjustedSummary
            };
            context.state.timingTestResults.push(result);
            context.platform.console.info(`[timing-test-result] ${JSON.stringify({
                phaseId: result.phaseId,
                phaseTitle: result.phaseTitle,
                label: result.label,
                words: result.summary.wordCount,
                naturalAudioSeconds: Number(result.naturalSummary.audioDurationSeconds.toFixed(2)),
                playbackRate: Number(result.playbackPlan.playbackRate.toFixed(4)),
                adjustedAudioSeconds: Number(result.summary.audioDurationSeconds.toFixed(2)),
                clockSeconds: Number(result.summary.timerConsumedSeconds.toFixed(2)),
                budgetSeconds: result.summary.timerBudgetSeconds,
                remainingSeconds: Number(result.summary.remainingSeconds.toFixed(2)),
                overrunSeconds: Number(result.summary.overrunSeconds.toFixed(2)),
                adjustedWordsPerMinute: Number(result.summary.wordsPerMinute.toFixed(1)),
                chunks: result.chunkCount,
                fastForwarded: result.fastForwarded
            })}`);
            context.services.renderTimingTestResults();
            return result;
        }


        function freezeTimerForFastForwardedSpeech(entry) {
            if (!context.settings.TIMING_TEST_MODE) return;
            const message = context.state.transcript[entry?.transcriptIndex] || {};
            const phase = context.services.getPhaseById(message.phaseId);
            if (!context.settings.SPEECH_TIMING.isTimedSpokenPhase(phase)) return;
            context.services.stopTimer();
            context.state.timer.phaseId = phase.id;
            context.state.timer.remaining = phase.duration;
            context.ui.timerDisplayEl.textContent = context.services.formatClock(phase.duration);
            context.ui.timerHintEl.textContent = context.services.l(
                "Fast-forwarding generated audio; exact virtual clock use will be reported.",
                "Avance rapide de l’audio généré; l’utilisation exacte de la minuterie virtuelle sera indiquée."
            );
        }


        function showFastForwardedTimingOnTimer(result) {
            if (!result?.fastForwarded || context.state.timer.phaseId !== result.phaseId) return;
            context.state.timer.remaining = Math.max(0, Math.ceil(result.summary.signedRemainingSeconds));
            context.ui.timerDisplayEl.textContent = context.services.formatClock(context.state.timer.remaining);
            context.ui.timerHintEl.textContent = result.summary.overrunSeconds > 0
                ? context.services.l(
                    `Virtual ${result.playbackPlan.playbackRate.toFixed(3)}× result: ${context.services.formatPreciseDuration(result.summary.overrunSeconds)} over time.`,
                    `Résultat virtuel à ${result.playbackPlan.playbackRate.toFixed(3)}× : dépassement de ${context.services.formatPreciseDuration(result.summary.overrunSeconds)}.`
                )
                : context.services.l(
                    `Virtual ${result.playbackPlan.playbackRate.toFixed(3)}× result: ${context.services.formatPreciseDuration(result.summary.remainingSeconds)} left.`,
                    `Résultat virtuel à ${result.playbackPlan.playbackRate.toFixed(3)}× : ${context.services.formatPreciseDuration(result.summary.remainingSeconds)} restant.`
                );
        }


        function createLocalAbortError() {
            const error = new Error(context.settings.STOP_SPEECH_ERROR);
            error.name = "AbortError";
            return error;
        }


        function speechRecordContext(entry) {
            const phase=context.services.getPhaseById(entry.phaseId)||context.services.getCurrentPhase();
            const judgeNumber=Number(String(entry.voiceKey||"").match(/judge(\d)/)?.[1]||phase?.judgeNumber||0);
            const role=entry.kind==="ai-alt"?"human":entry.kind==="ai"?"ai":"";
            const model=role?context.services.getParticipantModel(role):entry.kind==="judge"&&judgeNumber?context.services.getJudgeModel(judgeNumber):"";
            return {matchRunId:context.state.matchRunId,phaseId:entry.phaseId||"",kind:entry.kind,voiceKey:entry.voiceKey,locale:context.state.locale,textModel:model,
                reasoningEffort:model?context.settings.MODEL_CATALOG.getReasoningEffort(model,role?"participant":"judge"):"",
                originalText:entry.originalText||entry.text,actualWords:context.services.countWords(entry.originalText||entry.text),
                ...(["speech","judgeAnswer"].includes(phase?.kind)?{wordTarget:context.settings.AI_TURN_PROMPTS.getWordTarget({duration:phase.duration,locale:context.state.locale})?.target}:{}),
                chunkIndex:entry.chunkIndex,chunkCount:entry.chunkCount,phaseDuration:phase?.duration||0,
                speechStartLeadMs:entry.speechStartLeadMs||0,minimumHandoffGapMs:entry.minimumHandoffGapMs||0};
        }


        async function saveSpeechRecord(event,prepared,extra={}) {
            const bridge=context.platform.window.ethicsApi?.audio;
            if(typeof bridge?.recordSpeechEvent!=="function")return;
            return bridge.recordSpeechEvent({event,recordId:prepared?.recordId||null,...speechRecordContext(prepared?.entry||{}),at:new Date().toISOString(),...extra});
        }


        function saveSpeechRecordNotice(event,prepared,extra={}) {
            void saveSpeechRecord(event,prepared,extra).catch(error=>context.platform.console.error("Speech record persistence failed.",error));
        }


        async function fetchOpenAiSpeechAudio(entry, token, { controllerKind = "direct", trackController = true } = {}) {
            const runId = context.state.matchRunId;
            const isCurrent = () => token === context.state.speechToken && runId === context.state.matchRunId && !context.state.sessionClosed;
            if (!isCurrent()) return null;
            if (entry?.preparedAudio?.audioUrl) {
                const preparedAudio = entry.preparedAudio;
                entry.preparedAudio = null;
                return { ...preparedAudio, entry };
            }
            if (!context.services.hasCredential("openai")) throw new Error(context.services.l("An OpenAI credential is required for OpenAI read-aloud.", "Un identifiant OpenAI est requis pour la lecture OpenAI."));
            const controller = new context.platform.AbortController();
            if (trackController) {
                context.state.currentSpeechController = controller;
                context.state.currentSpeechControllerKind = controllerKind;
                context.services.refreshSpeechUi();
            }
            try {
                if (entry.text.length > context.settings.MAX_TTS_CHARS) throw new Error(context.services.l(`Read-aloud text exceeds the ${context.settings.MAX_TTS_CHARS}-character chunk limit. Nothing was clipped; split this speech into smaller chunks.`, `Le texte dépasse la limite de ${context.settings.MAX_TTS_CHARS} caractères par segment. Aucun texte n’a été tronqué; divisez cette lecture en segments plus petits.`));
                const isModerator = entry.kind === "moderator";
                const result = await getAudioBridge().speech({
                    model: isModerator ? context.settings.AUDIO_MODELS.moderatorSpeech : context.settings.AUDIO_MODELS.speech,
                    voice: context.settings.AUTO_SPEAK_VOICES[entry.voiceKey] || context.settings.AUTO_SPEAK_VOICES[entry.kind] || "alloy",
                    input: entry.text,
                    responseFormat: "mp3",
                    recordContext:speechRecordContext(entry),
                    ...(isModerator ? { instructions: context.settings.MODERATOR_SPEECH_INSTRUCTIONS }
                        : ["ai", "ai-alt"].includes(entry.kind) ? { instructions: participantSpeechInstructions } : {})
                });
                if (!isCurrent()) return null;
                if (controller.signal.aborted) throw createLocalAbortError();
                const audioBytes = toUint8Array(result?.bytes);
                const blob = new context.platform.Blob([audioBytes], { type: context.services.sanitizeText(result?.mimeType) || "audio/mpeg" });
                if (!blob.size) throw new Error("Empty speech audio response.");
                const prepared = {entry,audioUrl:context.platform.URL.createObjectURL(blob),audioBytes,mimeType:blob.type,recordId:result?.recordId||null};
                try {
                    const timing = await decodeSpeechAudioDuration(audioBytes,prepared.audioUrl);
                    if (!isCurrent()) { revokePreparedSpeechAudio(prepared); return null; }
                    prepared.naturalDurationSeconds = timing.durationSeconds;
                    prepared.decodedTiming = timing;
                    await saveSpeechRecord("generated_audio",prepared,{naturalDurationSeconds:timing.durationSeconds,chunkWords:context.services.countWords(entry.text),chunkText:entry.text,cacheReused:!!result?.cacheReused});
                    context.platform.console.info(`[speech-chunk-audit] ${JSON.stringify({phaseId:entry.phaseId,kind:entry.kind,transcriptIndex:entry.transcriptIndex,chunkIndex:entry.chunkIndex,wordCount:context.services.countWords(entry.text),characters:entry.text.length,naturalDurationSeconds:timing.durationSeconds})}`);
                    if (!isCurrent()) { revokePreparedSpeechAudio(prepared); return null; }
                    if (["ai","ai-alt","judge"].includes(entry.kind) && !context.settings.TIMING_TEST_MODE) {
                        const bridge = getAudioBridge();
                        if (typeof bridge.alignSpeech !== "function") throw new Error("The speech word-alignment bridge is unavailable.");
                        // Recognition starts during preparation and can finish
                        // while audio plays. It is still required before delivery
                        // completes or becomes available to the next model turn.
                        prepared.wordAlignmentPromise = Promise.resolve(bridge.alignSpeech({bytes:audioBytes,mimeType:blob.type,fileName:"speech.mp3",originalText:entry.text,durationSeconds:timing.durationSeconds,language:context.services.isFrenchLocale()?"fr":"en",recordId:prepared.recordId}))
                            .then(alignment => { if (!isCurrent()) return null; prepared.wordAlignment = alignment; return alignment; });
                        prepared.wordAlignmentPromise.catch(() => {});
                    }
                    if (!isCurrent()) {revokePreparedSpeechAudio(prepared);return null;}
                    return prepared;
                } catch(error) {
                    revokePreparedSpeechAudio(prepared);
                    throw error;
                }
            } finally {
                if (trackController && context.state.currentSpeechController === controller) {
                    context.state.currentSpeechController = null;
                    context.state.currentSpeechControllerKind = "";
                }
                if (trackController && isCurrent()) context.services.refreshSpeechUi();
            }
        }


        function encodePlayedAudioWav(decoded, through) {
            return context.platform.window.EthicsAudioPcm.encodePlayedPrefix(decoded,through);
        }


        async function finalizeActualAudioCutoff(message,prepared,through,runId) {
            const isCurrent = () => context.state.matchRunId === runId && !context.state.completed && !context.state.sessionClosed && ["transcribing", "unresolved"].includes(message.speechDeliveryState);
            if (!isCurrent()) return;
            try {
                context.state.spokenAudioTranscriptionPending=true;
                context.services.setStatus(context.services.l("Transcribing the audio played before time was called…","Transcription de l’audio joué avant l’arrêt…"));
                const AudioContextClass=context.platform.window.AudioContext||context.platform.window.webkitAudioContext;
                if(!context.state.timingTestAudioContext || context.state.timingTestAudioContext.state==="closed")context.state.timingTestAudioContext=new AudioContextClass();
                const input=toUint8Array(prepared.audioBytes),decoded=await context.state.timingTestAudioContext.decodeAudioData(input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength));
                if (!isCurrent()) return;
                const cropped=encodePlayedAudioWav(decoded,through);
                const transcript=await getAudioBridge().alignSpeech({bytes:cropped.bytes,mimeType:"audio/wav",fileName:"played-prefix.wav",originalText:prepared.entry.text,durationSeconds:cropped.durationSeconds,language:context.services.isFrenchLocale()?"fr":"en",recordId:prepared.recordId});
                if (!isCurrent()) return;
                context.settings.SPEECH_DELIVERY.finalizeSpokenCutoff(message,transcript.transcriptText);
                context.state.spokenAudioCutoffRetry=null;context.services.renderTranscript();
                await saveSpeechRecord("delivery_finalized",prepared,{deliveryState:message.speechDeliveryState,deliveredPrefix:message.text,recognizedPartialText:transcript.transcriptText,playedAudioSeconds:cropped.durationSeconds,recognitionRecordId:transcript.recognitionRecordId,policy:"spoken-audio"});
            }catch(error){
                if(isCurrent()){context.settings.SPEECH_DELIVERY.sealUnresolved(message);context.state.spokenAudioCutoffRetry={message,prepared,through,runId};context.services.renderTranscript();}
                throw error;
            }finally{if(context.state.matchRunId===runId && !context.state.sessionClosed){context.state.spokenAudioTranscriptionPending=false;context.services.updateComposerModeIndicator();}}
        }


        function captureActiveSpeechDelivery() {
            const active = context.state.currentDeliveryPlayback;
            if (!active || active.token !== context.state.speechToken || active.runId !== context.state.matchRunId || context.state.sessionClosed) return;
            const changed = context.settings.SPEECH_DELIVERY.captureProgress(active.message,active.entry.chunkIndex,active.audio);
            const preview = context.settings.SPEECH_DELIVERY.previewText(active.message);
            const range = preview !== null ? context.settings.SPEECH_DELIVERY.previewHighlightRange(active.message,active.entry.chunkIndex,active.audio)
                : context.settings.SPEECH_DELIVERY.highlightRange(active.message,active.entry.chunkIndex,active.audio);
            const previousIndex = context.state.speechProgressMessageIndex;
            context.state.speechProgressMessageIndex = range || preview !== null ? active.entry.transcriptIndex : -1;
            context.state.speechProgressReadTo = range?.startChar || 0;
            context.state.speechProgressSpeakStart = range?.startChar || 0;
            context.state.speechProgressSpeakEnd = range?.endChar || 0;
            if (changed) context.services.renderTranscript();
            else if (range || preview !== null) context.services.syncSpeechProgressToUi(false);
            if (previousIndex >= 0 && previousIndex !== context.state.speechProgressMessageIndex) context.services.restoreMessageBodyPlainText(previousIndex);
        }


        async function playPreparedOpenAiSpeechChunk(prepared, token) {
            const runId = context.state.matchRunId;
            const audioEl = context.services.ensureSpeechAudioEl();
            if (!prepared?.audioUrl || token !== context.state.speechToken || context.state.sessionClosed) return;
            if (context.state.currentAudioUrl && context.state.currentAudioUrl !== prepared.audioUrl) {
                try { context.platform.URL.revokeObjectURL(context.state.currentAudioUrl); } catch {}
                context.state.currentAudioUrl = "";
            }
            const message = context.state.transcript[prepared.entry?.transcriptIndex];
            if (context.settings.SPEECH_DELIVERY.has(message)) {
                if (prepared.wordAlignment) context.settings.SPEECH_DELIVERY.registerSpokenTranscript(message,prepared.entry.chunkIndex,prepared.wordAlignment);
                else if (prepared.wordAlignmentPromise) {
                    prepared.wordAlignmentPromise.then(alignment => {
                        if (token === context.state.speechToken && runId === context.state.matchRunId
                            && !context.state.sessionClosed && message.speechDeliveryState === "pending") {
                            context.settings.SPEECH_DELIVERY.registerSpokenTranscript(message,prepared.entry.chunkIndex,alignment);
                        }
                    }).catch(() => {});
                } else throw new Error("The prepared audio needs a speech transcript.");
                context.state.currentDeliveryPlayback = {message,entry:prepared.entry,audio:audioEl,token,runId:context.state.matchRunId};
            }
            context.state.currentAudioUrl = prepared.audioUrl;
            audioEl.src = prepared.audioUrl;
            const requestedPlaybackRate = Number(prepared.entry?.playbackRate);
            const playbackRate = Number.isFinite(requestedPlaybackRate) && requestedPlaybackRate > 0
                ? Math.min(context.settings.WHOLE_SPEECH_MAX_PLAYBACK_RATE, Math.max(context.settings.WHOLE_SPEECH_MIN_PLAYBACK_RATE, requestedPlaybackRate))
                : 1;
            audioEl.defaultPlaybackRate = playbackRate;
            audioEl.playbackRate = playbackRate;
            if ("preservesPitch" in audioEl) audioEl.preservesPitch = true;
            if ("webkitPreservesPitch" in audioEl) audioEl.webkitPreservesPitch = true;
            await saveSpeechRecord("playback_started",prepared,{playbackRate,naturalDurationSeconds:prepared.naturalDurationSeconds,mediaTime:0,wallTime:Date.now(),timerRemaining:context.state.timer.remaining});
            if (token !== context.state.speechToken || runId !== context.state.matchRunId || context.state.sessionClosed) return;
            prepared.playbackWallStart=Date.now();
            context.state.currentSpeechRecordPlayback=prepared;
            context.state.speechPlaybackActive = true;
            context.services.refreshSpeechUi();
            context.services.queueSpeechFollowScroll(true);
            try {
                await new Promise((resolve, reject) => {
                    let settled = false;
                    let playbackStarted = false;
                    const notifyPlaybackStarted = () => {
                        if (token !== context.state.speechToken) return;
                        if(playbackStarted){saveSpeechRecordNotice("playback_resumed",prepared,{mediaTime:audioEl.currentTime,wallTime:Date.now(),playbackRate:audioEl.playbackRate,timerRemaining:context.state.timer.remaining});return;}
                        playbackStarted = true;
                        context.services.invokeSpeechStartCallbacks(prepared.entry?.transcriptIndex);
                    };
                    const rejectRef = (error) => {
                        if (settled) return;
                        settled = true;
                        if (context.state.currentSpeechReject === rejectRef) context.state.currentSpeechReject = null;
                        reject(error);
                    };
                    let ending = false;
                    const resolveRef = async () => {
                        if (settled || ending || token !== context.state.speechToken) return;
                        ending = true;
                        try {
                            if (context.settings.SPEECH_DELIVERY.has(message) && prepared.wordAlignmentPromise) {
                                const alignment = await prepared.wordAlignmentPromise;
                                if (settled || token !== context.state.speechToken || runId !== context.state.matchRunId || context.state.sessionClosed) return;
                                context.settings.SPEECH_DELIVERY.registerSpokenTranscript(message,prepared.entry.chunkIndex,alignment);
                            }
                        } catch (error) { rejectRef(error); return; }
                        try {
                            if (context.settings.SPEECH_DELIVERY.hasFullPlayback(audioEl)
                                && context.settings.SPEECH_DELIVERY.completeChunk(message, prepared.entry?.chunkIndex)) context.services.renderTranscript();
                            notifyPlaybackStarted();
                            saveSpeechRecordNotice("playback_ended",prepared,{mediaTime:audioEl.currentTime,wallMilliseconds:Date.now()-prepared.playbackWallStart,playedThrough:context.settings.SPEECH_DELIVERY.playedThrough(audioEl),playbackRate:audioEl.playbackRate,deliveredPrefix:message?.text||"",deliveryState:message?.speechDeliveryState||"complete",timerRemaining:context.state.timer.remaining});
                            settled = true;
                            if (context.state.currentSpeechReject === rejectRef) context.state.currentSpeechReject = null;
                            resolve();
                        } catch (error) { rejectRef(error); }
                    };
                    context.state.currentSpeechReject = rejectRef;
                    audioEl.ontimeupdate = captureActiveSpeechDelivery;
                    audioEl.onplaying = notifyPlaybackStarted;
                    audioEl.onpause=()=>saveSpeechRecordNotice("playback_paused",prepared,{mediaTime:audioEl.currentTime,wallTime:Date.now(),timerRemaining:context.state.timer.remaining});
                    audioEl.onended = resolveRef;
                    audioEl.onerror = () => rejectRef(new Error("AI voice playback failed."));
                    try {
                        const playPromise = audioEl.play();
                        if (playPromise && typeof playPromise.then === "function") {
                            playPromise.then(notifyPlaybackStarted).catch(() => rejectRef(new Error("Voice autoplay was blocked.")));
                        }
                    } catch {
                        rejectRef(new Error("Voice autoplay was blocked."));
                    }
                });
            } finally {
                if(context.state.currentSpeechRecordPlayback===prepared)context.state.currentSpeechRecordPlayback=null;
                if (context.state.currentDeliveryPlayback?.token === token) context.state.currentDeliveryPlayback = null;
                if (token === context.state.speechToken && runId === context.state.matchRunId && !context.state.sessionClosed) {
                    context.state.speechPlaybackActive = false;
                    context.services.refreshSpeechUi();
                }
            }
        }


        function kickOpenAiSpeechLookahead(token) {
            if (token !== context.state.speechToken) return;
            if (context.state.openAiSpeechLookaheadPromise || context.state.openAiSpeechLookaheadPrepared) return;
            const nextEntry = context.state.speechQueue.shift();
            if (!nextEntry) return;
            context.state.openAiSpeechLookaheadEntry = nextEntry;
            let trackedPromise = null;
            trackedPromise = fetchOpenAiSpeechAudio(nextEntry, token, { controllerKind: "lookahead" })
            .then((prepared) => {
                if (!prepared) return null;
                if (token !== context.state.speechToken || context.state.openAiSpeechLookaheadPromise !== trackedPromise) {
                    if (prepared.audioUrl) {
                        try { context.platform.URL.revokeObjectURL(prepared.audioUrl); } catch {}
                    }
                    return null;
                }
                context.state.openAiSpeechLookaheadPrepared = prepared;
                context.services.refreshSpeechUi();
                return prepared;
            })
            .catch((error) => {
                if (!error?.speechEntry) error.speechEntry = nextEntry;
                throw error;
            });
            trackedPromise.catch(() => {});
            context.state.openAiSpeechLookaheadPromise = trackedPromise;
            context.services.refreshSpeechUi();
        }


        async function getNextOpenAiSpeechPrepared(token) {
            if (token !== context.state.speechToken) return null;
            if (context.state.openAiSpeechLookaheadPrepared) {
                const prepared = context.state.openAiSpeechLookaheadPrepared;
                context.state.openAiSpeechLookaheadPrepared = null;
                context.state.openAiSpeechLookaheadPromise = null;
                context.state.openAiSpeechLookaheadEntry = null;
                context.services.refreshSpeechUi();
                return prepared;
            }
            if (context.state.openAiSpeechLookaheadPromise) {
                const promise = context.state.openAiSpeechLookaheadPromise;
                try {
                    const prepared = await promise;
                    if (context.state.openAiSpeechLookaheadPromise === promise) {
                        context.state.openAiSpeechLookaheadPrepared = null;
                        context.state.openAiSpeechLookaheadPromise = null;
                        context.state.openAiSpeechLookaheadEntry = null;
                    }
                    context.services.refreshSpeechUi();
                    return prepared;
                } catch (error) {
                    if (context.state.openAiSpeechLookaheadPromise === promise) {
                        const failedEntry = context.state.openAiSpeechLookaheadEntry;
                        context.state.openAiSpeechLookaheadPrepared = null;
                        context.state.openAiSpeechLookaheadPromise = null;
                        context.state.openAiSpeechLookaheadEntry = null;
                        if (!error?.speechEntry && failedEntry) error.speechEntry = failedEntry;
                    }
                    context.services.refreshSpeechUi();
                    throw error;
                }
            }
            const directEntry = context.state.speechQueue.shift();
            if (!directEntry) return null;
            try {
                return await fetchOpenAiSpeechAudio(directEntry, token, { controllerKind: "direct" });
            } catch (error) {
                if (!error?.speechEntry) error.speechEntry = directEntry;
                throw error;
            }
        }


        function handleOpenAiSpeechFailure(error, token) {
            if (token !== context.state.speechToken) return;
            context.platform.console.error("OpenAI read-aloud failed:", error);
            const detail = context.services.safeBridgeErrorMessage(error);
            stopSpeechPlayback(false, {deliveryReason:"error"});
            context.services.setStatus(
                detail || context.services.l("OpenAI read-aloud failed.", "La lecture OpenAI a échoué."),
                true
            );
        }


        function revokePreparedSpeechAudio(prepared) {
            if (!prepared?.audioUrl) return;
            try { context.platform.URL.revokeObjectURL(prepared.audioUrl); } catch {}
        }


        function takeNextTimingTestSpeechMessage() {
            if (!context.settings.TIMING_TEST_MODE || !context.state.speechQueue.length) return [];
            const transcriptIndex = context.state.speechQueue[0]?.transcriptIndex;
            const entries = [];
            while (context.state.speechQueue[0]?.transcriptIndex === transcriptIndex) {
                entries.push(context.state.speechQueue.shift());
            }
            return entries;
        }


        async function processConcurrentTimingTestSpeech(entries, token) {
            const results = await context.settings.SPEECH_TIMING.mapWithConcurrency(
                entries,
                context.settings.TIMING_TEST_TTS_CONCURRENCY,
                async (entry) => {
                    let prepared = null;
                    try {
                        prepared = await fetchOpenAiSpeechAudio(entry, token, {
                            controllerKind: "timing-test",
                            trackController: false
                        });
                        if (!prepared) return { entry, cancelled: true };
                        const decodedTiming = prepared.decodedTiming || await decodeSpeechAudioDuration(prepared.audioBytes, prepared.audioUrl);
                        return { entry, prepared, decodedTiming };
                    } catch (error) {
                        return { entry, prepared, error };
                    }
                }
            );

            if (token !== context.state.speechToken || results.some((result) => result.cancelled)) {
                results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                return false;
            }

            const failed = results.find((result) => result.error);
            if (failed) {
                results.forEach((result) => revokePreparedSpeechAudio(result.prepared));
                if (!failed.error?.speechEntry) failed.error.speechEntry = failed.entry;
                throw failed.error;
            }

            results.forEach(({ prepared, decodedTiming }) => {
                const timingTestResult = recordTimingTestSpeechChunk(prepared, decodedTiming);
                context.services.invokeSpeechStartCallbacks(prepared.entry?.transcriptIndex);
                freezeTimerForFastForwardedSpeech(prepared.entry);
                showFastForwardedTimingOnTimer(timingTestResult);
                context.services.markSpeechChunkComplete(prepared.entry.transcriptIndex);
                if (!prepared.retainedForTimingPreview) revokePreparedSpeechAudio(prepared);
            });
            context.services.refreshSpeechUi();
            await context.services.waitMs(0);
            return token === context.state.speechToken;
        }


        async function processSpeechQueue(token = context.state.speechToken) {
            if (context.state.sessionClosed || context.state.speechProcessing) return;
            context.state.speechProcessing = true;
            context.services.refreshSpeechUi();
            try {
                while (token === context.state.speechToken) {
                    if (context.settings.TIMING_TEST_MODE) {
                        const timingEntries = takeNextTimingTestSpeechMessage();
                        if (!timingEntries.length) break;
                        try {
                            if (!await processConcurrentTimingTestSpeech(timingEntries, token)) break;
                        } catch (error) {
                            if (token !== context.state.speechToken || error?.name === "AbortError" || error?.message === context.settings.STOP_SPEECH_ERROR) break;
                            handleOpenAiSpeechFailure(error, token);
                            break;
                        }
                        continue;
                    }
                    let prepared = null;
                    try {
                        prepared = await getNextOpenAiSpeechPrepared(token);
                    } catch (error) {
                        if (token !== context.state.speechToken || error?.name === "AbortError" || error?.message === context.settings.STOP_SPEECH_ERROR) break;
                        handleOpenAiSpeechFailure(error, token);
                        break;
                    }
                    if (!prepared) break;
                    kickOpenAiSpeechLookahead(token);
                    const minimumHandoffGapMs = Math.max(0, Math.min(3000, Number(prepared.entry?.minimumHandoffGapMs) || 0));
                    const elapsedSincePriorSpeechMs = context.state.lastSpeechEndedAtMs
                        ? Math.max(0, Date.now() - context.state.lastSpeechEndedAtMs)
                        : minimumHandoffGapMs;
                    const remainingHandoffGapMs = Math.max(0, minimumHandoffGapMs - elapsedSincePriorSpeechMs);
                    if (remainingHandoffGapMs) {
                        await context.services.waitMs(remainingHandoffGapMs);
                        if (token !== context.state.speechToken) {
                            if (prepared.audioUrl) {
                                try { context.platform.URL.revokeObjectURL(prepared.audioUrl); } catch {}
                            }
                            break;
                        }
                    }
                    context.services.invokeSpeechStartCallbacks(prepared.entry?.transcriptIndex);
                    const speechStartLeadMs = Math.max(0, Math.min(3000, Number(prepared.entry?.speechStartLeadMs) || 0));
                    if (speechStartLeadMs) {
                        await context.services.waitMs(speechStartLeadMs);
                        if (token !== context.state.speechToken) {
                            if (prepared.audioUrl) {
                                try { context.platform.URL.revokeObjectURL(prepared.audioUrl); } catch {}
                            }
                            break;
                        }
                    }
                    context.services.beginSpeechProgressForQueueEntry(prepared.entry);
                    try {
                        await playPreparedOpenAiSpeechChunk(prepared, token);
                        if (token !== context.state.speechToken || context.state.sessionClosed) break;
                        context.state.lastSpeechEndedAtMs = Date.now();
                        context.services.markSpeechChunkComplete(prepared.entry.transcriptIndex);
                    } catch (error) {
                        if (token !== context.state.speechToken || error?.name === "AbortError" || error?.message === context.settings.STOP_SPEECH_ERROR) break;
                        handleOpenAiSpeechFailure(error, token);
                        break;
                    } finally {
                        if (token === context.state.speechToken) resetSpeechAudioEl();
                        context.services.refreshSpeechUi();
                    }
                }
            } finally {
                if (token === context.state.speechToken && !context.state.sessionClosed) context.state.speechProcessing = false;
                if (token === context.state.speechToken && !context.state.speechQueue.length && !context.state.openAiSpeechLookaheadPromise && !context.state.openAiSpeechLookaheadPrepared && !context.state.currentSpeechController && !context.state.speechPlaybackActive) {
                    context.services.finishSpeechProgressPlayback();
                }
                context.services.refreshSpeechUi();
            }
        }


        function enqueuePreparedWholeSpeech(kind, text, transcriptIndex, voiceKey, options, phase) {
            const descriptor = { kind, voiceKey: voiceKey || kind };
            const enqueueToken = context.state.speechToken;
            const enqueueRunId = context.state.matchRunId;
            context.state.wholeSpeechPendingTranscriptIndexes.add(transcriptIndex);
            context.services.ensureSpeechUi();
            context.services.refreshSpeechUi();

            void prepareWholeSpeechAudioForPhase(phase, text, descriptor)
            .then((record) => {
                if (!record) return;
                const message = context.state.transcript[transcriptIndex];
                const isCurrent = enqueueToken === context.state.speechToken
                    && enqueueRunId === context.state.matchRunId
                    && (context.settings.SPEECH_DELIVERY.has(message) ? context.settings.SPEECH_DELIVERY.matchesSource(message, text) : context.services.normalizeSpeechText(message?.text) === context.services.normalizeSpeechText(text))
                    && message?.phaseId === phase.id;
                if (!isCurrent) {
                    clearWholeSpeechPreparation(phase.id);
                    return;
                }

                const entries = buildSpeechQueueEntries(kind, text, transcriptIndex, voiceKey, options);
                const chunksMatch = entries.length === record.preparedChunks.length
                    && entries.every((entry, index) => entry.text === record.preparedChunks[index]?.entry?.text);
                if (!chunksMatch) {
                    clearWholeSpeechPreparation(phase.id);
                    throw new Error("Prepared whole-speech audio no longer matches the queued speech text.");
                }

                const timerLeadMs = entries.reduce(
                    (total, entry) => total + Math.max(0, Number(entry.speechStartLeadMs) || 0),
                    0
                );
                const plan = context.settings.SPEECH_TIMING.planWholeSpeechPlayback({
                    audioDurationSeconds: record.totalAudioDurationSeconds,
                    timerLeadMs,
                    timerBudgetSeconds: phase.duration,
                    minimumPlaybackRate: context.settings.WHOLE_SPEECH_MIN_PLAYBACK_RATE,
                    maximumPlaybackRate: context.settings.WHOLE_SPEECH_MAX_PLAYBACK_RATE
                });

                if (context.state.wholeSpeechPreparations.get(phase.id) === record) {
                    context.state.wholeSpeechPreparations.delete(phase.id);
                }
                record.consumed = true;
                entries.forEach((entry, index) => {
                    const prepared = record.preparedChunks[index].prepared;
                    entry.playbackRate = plan.playbackRate;
                    entry.preparedAudio = {
                        audioUrl: prepared.audioUrl,
                        audioBytes: prepared.audioBytes,
                        mimeType: prepared.mimeType,
                        recordId: prepared.recordId,
                        wordAlignment: prepared.wordAlignment,
                        wordAlignmentPromise: prepared.wordAlignmentPromise,
                        decodedTiming: prepared.decodedTiming,
                        naturalDurationSeconds: prepared.naturalDurationSeconds
                    };
                });
                record.preparedChunks = [];

                context.services.trackSpeechChunksForMessage(transcriptIndex, entries.length);
                context.state.speechQueue.push(...entries);
                context.services.refreshSpeechUi();
                void processSpeechQueue(enqueueToken);
            })
            .catch((error) => {
                if (enqueueToken !== context.state.speechToken || enqueueRunId !== context.state.matchRunId) return;
                handleOpenAiSpeechFailure(error, enqueueToken);
            })
            .finally(() => {
                context.state.wholeSpeechPendingTranscriptIndexes.delete(transcriptIndex);
                context.services.refreshSpeechUi();
            });
        }


        function enqueueTranscriptSpeech(kind, text, transcriptIndex = -1, voiceKey = "", options = {}) {
            if (!context.settings.AUTO_SPEAK_MESSAGE_KINDS.has(kind)) return;
            const normalized = context.services.normalizeSpeechText(text);
            if (!normalized) return;
            const phase = context.services.getPhaseById(options.phaseId);
            const descriptor = getWholeSpeechDescriptorForPhase(phase);
            const usePreparedWholeSpeech = !context.settings.TIMING_TEST_MODE
                && !!descriptor
                && descriptor.kind === kind
                && descriptor.voiceKey === (voiceKey || kind);
            if (usePreparedWholeSpeech) {
                enqueuePreparedWholeSpeech(kind, String(text || ""), transcriptIndex, voiceKey, options, phase);
                return;
            }

            const chunks = buildSpeechQueueEntries(kind, String(text || ""), transcriptIndex, voiceKey, options);
            if (!chunks.length) {
                context.services.finalizeSpeechPlaybackForMessage(transcriptIndex);
                return;
            }
            context.services.trackSpeechChunksForMessage(transcriptIndex, chunks.length);
            context.services.ensureSpeechUi();
            context.state.speechQueue.push(...chunks);
            if (context.state.speechPlaybackActive && !context.state.openAiSpeechLookaheadPromise && !context.state.openAiSpeechLookaheadPrepared) {
                kickOpenAiSpeechLookahead(context.state.speechToken);
            }
            context.services.refreshSpeechUi();
            void processSpeechQueue(context.state.speechToken);
        }


        function shouldAutoSpeakMessage(kind, text, options = {}) {
            if (options.silent || !context.settings.AUTO_SPEAK_MESSAGE_KINDS.has(kind) || !context.services.normalizeSpeechText(text)) return false;
            if (!context.settings.TIMING_TEST_MODE) return true;
            const phase = context.services.getPhaseById(options.phaseId);
            return context.settings.SPEECH_TIMING.shouldReportTimedMessage({ kind }, phase);
        }
        return Object.freeze({rejectCurrentSpeechPlayback,resetSpeechAudioEl,revokeQueuedPreparedSpeechAudio,clearOpenAiSpeechLookahead,stopSpeechPlayback,splitTextByWords,chunkTextForSpeech,buildSpeechQueueEntries,ensureSentenceEnding,getAudioBridge,toUint8Array,blobToByteArray,decodeSpeechAudioDuration,getWholeSpeechDescriptorForPhase,wholeSpeechPreparationMatches,releaseWholeSpeechPreparation,clearWholeSpeechPreparation,clearAllWholeSpeechPreparations,prepareWholeSpeechAudioForPhase,primeWholeSpeechAudioForPhase,recordTimingTestSpeechChunk,freezeTimerForFastForwardedSpeech,showFastForwardedTimingOnTimer,createLocalAbortError,speechRecordContext,saveSpeechRecord,saveSpeechRecordNotice,fetchOpenAiSpeechAudio,encodePlayedAudioWav,finalizeActualAudioCutoff,captureActiveSpeechDelivery,playPreparedOpenAiSpeechChunk,kickOpenAiSpeechLookahead,getNextOpenAiSpeechPrepared,handleOpenAiSpeechFailure,revokePreparedSpeechAudio,takeNextTimingTestSpeechMessage,processConcurrentTimingTestSpeech,processSpeechQueue,enqueuePreparedWholeSpeech,enqueueTranscriptSpeech,shouldAutoSpeakMessage});
    }
    return Object.freeze({create,dependencies});
});
