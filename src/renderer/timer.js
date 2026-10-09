(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["timer"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["formatClock", "getCurrentPhase", "handleTimedPhaseExpiration", "isAiControlledRole", "isFrenchLocale", "judgeLabel", "l", "maybeCompletePreparedAiConferral", "refreshControls", "setStatus", "speakerName"], "settings": ["PHASE_TIMER_POLICY"], "ui": ["timerDisplayEl", "timerHintEl"], "platform": ["window"]});
    function create(context) {
        function stopTimer() {
            if (context.state.timer.intervalId) {
                clearInterval(context.state.timer.intervalId);
                context.state.timer.intervalId = null;
            }
            context.state.timer.running = false;
        }


        function prepareTimerForPhaseAnnouncement(phase) {
            stopTimer();
            context.state.timer.warnedKeys = new Set();
            context.state.timer.phaseId = phase?.id || "";
            context.state.timer.remaining = phase?.duration || 0;
            context.ui.timerHintEl.classList.remove("error");
            if (!phase) {
                context.ui.timerDisplayEl.textContent = "--:--";
                context.ui.timerHintEl.textContent = context.services.l("No active timed phase.", "Aucune phase minutée active.");
                return;
            }
            if (phase.duration) {
                context.ui.timerDisplayEl.textContent = context.services.formatClock(phase.duration);
                context.ui.timerHintEl.textContent = context.services.l("Timer will start when the moderator finishes speaking.", "La minuterie commencera quand le modérateur aura fini de parler.");
                return;
            }
            context.ui.timerDisplayEl.textContent = "--:--";
            if (phase.kind === "moderatorCase" || phase.kind === "scoring") {
                context.ui.timerHintEl.textContent = context.services.l("Advancing automatically when the moderator finishes speaking.", "Passage automatique quand le modérateur a fini de parler.");
                return;
            }
            if (phase.kind === "closing") {
                context.ui.timerHintEl.textContent = context.state.judgeMode === "ai"
                ? context.services.l("Generating the final decision after the moderator finishes speaking.", "Génération de la décision finale après la fin du modérateur.")
                : context.services.l("Enter the final human-judge scores after the moderator finishes speaking.", "Entrez les notes finales des juges humains après la fin du modérateur.");
                return;
            }
            context.ui.timerHintEl.textContent = context.services.l("Waiting for the moderator to finish speaking.", "En attente de la fin du modérateur.");
        }


        function phaseTimerStartsWithAutoSpeech(phase) {
            return context.settings.PHASE_TIMER_POLICY.startsWithAutoSpeech(phase, {
                speakerIsAiControlled: context.services.isAiControlledRole(phase?.speaker),
                judgeMode: context.state.judgeMode
            });
        }


        function phasePreloadsAutoSpeechDuringModerator(phase) {
            return context.settings.PHASE_TIMER_POLICY.preloadsDuringModerator(phase, {
                speakerIsAiControlled: context.services.isAiControlledRole(phase?.speaker)
            });
        }


        function phaseUsesNaturalModeratorHandoff(phase) {
            return context.settings.PHASE_TIMER_POLICY.usesNaturalModeratorHandoff(phase, {
                speakerIsAiControlled: context.services.isAiControlledRole(phase?.speaker)
            });
        }


        function prepareTimerForAutoSpeech(phase) {
            prepareTimerForPhaseAnnouncement(phase);
            if (!phase?.duration) return;
            context.ui.timerHintEl.textContent = context.services.l(
                "Preparing speech audio. The timer will start when speaking begins.",
                "Préparation de l’audio. La minuterie démarrera au début de la prise de parole."
            );
        }


        function warningThresholdsForPhase(phase) {
            if (!phase) return [];
            if (phase.kind === "speech" && phase.subtype === "presentation") return [120, 60, 30];
            if (phase.kind === "speech" && (phase.subtype === "commentary" || phase.subtype === "response")) return [60, 30];
            if (phase.kind === "confer") return [60, 30];
            if (phase.kind === "judgeQuestion") return [15];
            if (phase.kind === "judgeAnswer") return [30];
            return [];
        }


        function timerWarningLabel(phase, remaining) {
            if (!phase) return "";
            if (phase.kind === "speech" || phase.kind === "confer") {
                return context.services.isFrenchLocale()
                ? `${phase.title} : ${context.services.formatClock(remaining)} restantes.`
                : `${phase.title}: ${context.services.formatClock(remaining)} remaining.`;
            }
            if (phase.kind === "judgeQuestion") {
                return context.services.isFrenchLocale()
                ? `${context.services.judgeLabel(phase.judgeNumber)} : ${context.services.formatClock(remaining)} restantes pour la question.`
                : `${context.services.judgeLabel(phase.judgeNumber)}: ${context.services.formatClock(remaining)} remaining for the question.`;
            }
            if (phase.kind === "judgeAnswer") {
                return context.services.isFrenchLocale()
                ? `${context.services.speakerName(phase.speaker)} : ${context.services.formatClock(remaining)} restantes pour répondre au ${context.services.judgeLabel(phase.judgeNumber)}.`
                : `${context.services.speakerName(phase.speaker)}: ${context.services.formatClock(remaining)} remaining to answer ${context.services.judgeLabel(phase.judgeNumber)}.`;
            }
            return context.services.isFrenchLocale()
            ? `${phase.title} : ${context.services.formatClock(remaining)} restantes.`
            : `${phase.title}: ${context.services.formatClock(remaining)} remaining.`;
        }


        function remainingPhaseSeconds() {
            const timer=context.state.timer;
            const elapsed=timer.running && Number.isFinite(timer.lastTickAtMs)
                ? Math.max(0,context.platform.window.performance.now()-timer.lastTickAtMs)/1000 : 0;
            return Math.max(0,timer.remaining-elapsed);
        }

        function consumeSkippedSpeechSeconds(seconds) {
            if(!Number.isFinite(seconds)||seconds<0)throw new Error("Invalid skipped speech duration.");
            context.state.timer.remaining=Math.max(0,context.state.timer.remaining-seconds);
            context.ui.timerDisplayEl.textContent=context.services.formatClock(context.state.timer.remaining);
        }


        function setTimerForPhase(phase) {
            stopTimer();
            context.state.timer.warnedKeys = new Set();
            context.state.timer.phaseId = phase?.id || "";
            context.state.timer.remaining = phase?.duration || 0;
            context.ui.timerDisplayEl.textContent = phase?.duration ? context.services.formatClock(phase.duration) : "--:--";
            context.ui.timerHintEl.textContent = phase?.duration ? context.services.l("Timer auto-started for this phase.", "La minuterie a démarré automatiquement pour cette phase.") : context.services.l("No active timed phase.", "Aucune phase minutée active.");
            context.ui.timerHintEl.classList.remove("error");
            if (!phase?.duration) return;
            context.state.timer.running = true;
            context.state.timer.lastTickAtMs = context.platform.window.performance.now();
            context.state.timer.intervalId = context.platform.window.setInterval(() => {
                if (!context.state.timer.running) return;
                context.state.timer.lastTickAtMs = context.platform.window.performance.now();
                const currentPhase = context.services.getCurrentPhase();
                if (context.services.maybeCompletePreparedAiConferral(currentPhase)) return;
                context.state.timer.remaining -= 1;
                if (context.state.timer.remaining < 0) context.state.timer.remaining = 0;
                context.ui.timerDisplayEl.textContent = context.services.formatClock(context.state.timer.remaining);
                const thresholds = warningThresholdsForPhase(currentPhase);
                thresholds.forEach((threshold) => {
                    const key = `${currentPhase?.id || ""}:${threshold}`;
                    if (context.state.timer.remaining <= threshold && context.state.timer.remaining > threshold-1 && !context.state.timer.warnedKeys.has(key)) {
                        context.state.timer.warnedKeys.add(key);
                        context.services.setStatus(timerWarningLabel(currentPhase, threshold));
                    }
                });
                if (context.state.timer.remaining <= 0) {
                    const key = `${currentPhase?.id || ""}:timeup`;
                    if (!context.state.timer.warnedKeys.has(key)) {
                        context.state.timer.warnedKeys.add(key);
                        context.services.handleTimedPhaseExpiration(currentPhase);
                    }
                }
            }, 1000);
        }


        function startTimerWithAutoSpeech(phaseId, remainingReadyChecks = 3) {
            const phase = context.services.getCurrentPhase();
            if (!phase || phase.id !== phaseId || context.state.completed) return;
            if (!context.state.phaseReady) {
                if (remainingReadyChecks > 0) {
                    context.platform.window.setTimeout(() => startTimerWithAutoSpeech(phaseId, remainingReadyChecks - 1), 0);
                }
                return;
            }
            if (!phaseTimerStartsWithAutoSpeech(phase) || context.state.timer.intervalId) return;
            setTimerForPhase(phase);
            context.ui.timerHintEl.textContent = context.services.l(
                "Timer started. Speech begins now.",
                "La minuterie a démarré. La prise de parole commence maintenant."
            );
            context.services.refreshControls();
        }


        function pauseTimer() {
            if (!context.state.timer.intervalId || !context.state.timer.running) return;
            context.state.timer.running = false;
            context.ui.timerHintEl.textContent = context.services.l("Timer paused.", "Minuterie en pause.");
            context.services.refreshControls();
        }


        function resumeTimer() {
            if (!context.state.timer.intervalId || context.state.timer.remaining <= 0) return;
            context.state.timer.running = true;
            context.state.timer.lastTickAtMs = context.platform.window.performance.now();
            context.ui.timerHintEl.textContent = context.services.l("Timer resumed.", "Minuterie reprise.");
            context.services.refreshControls();
        }


        function resetPhaseTimer() {
            const phase = context.services.getCurrentPhase();
            if (!phase?.duration) {
                context.services.setStatus(context.services.l("There is no active timed phase to reset.", "Il n’y a aucune phase minutée active à réinitialiser."), true);
                return;
            }
            if (!context.state.phaseReady) {
                prepareTimerForPhaseAnnouncement(phase);
                context.services.setStatus(context.services.isFrenchLocale() ? `Minuterie réinitialisée pour ${phase.title}. Elle commencera quand le modérateur aura fini de parler.` : `Timer reset for ${phase.title}. It will start when the moderator finishes speaking.`);
                context.services.refreshControls();
                return;
            }
            if (phaseTimerStartsWithAutoSpeech(phase) && !context.state.timer.intervalId) {
                prepareTimerForAutoSpeech(phase);
                context.services.setStatus(context.services.isFrenchLocale() ? `Minuterie réinitialisée pour ${phase.title}. Elle démarrera au début de la prise de parole.` : `Timer reset for ${phase.title}. It will start when speech begins.`);
                context.services.refreshControls();
                return;
            }
            setTimerForPhase(phase);
            context.services.setStatus(context.services.isFrenchLocale() ? `Minuterie réinitialisée pour ${phase.title}.` : `Timer reset for ${phase.title}.`);
            context.services.refreshControls();
        }
        return Object.freeze({stopTimer,prepareTimerForPhaseAnnouncement,phaseTimerStartsWithAutoSpeech,phasePreloadsAutoSpeechDuringModerator,phaseUsesNaturalModeratorHandoff,prepareTimerForAutoSpeech,warningThresholdsForPhase,timerWarningLabel,remainingPhaseSeconds,consumeSkippedSpeechSeconds,setTimerForPhase,startTimerWithAutoSpeech,pauseTimer,resumeTimer,resetPhaseTimer});
    }
    return Object.freeze({create,dependencies});
});
