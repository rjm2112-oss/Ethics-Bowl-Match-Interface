(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root){root.EthicsRenderer=root.EthicsRenderer||{};root.EthicsRenderer["pending-submission"]=api;}})(typeof globalThis==="object"?globalThis:this,function(){"use strict";
    const dependencies=Object.freeze({"services": ["advancePhase", "clearMainComposerJudgeBinding", "commitMainComposerSubmission", "concludeTimedOutHumanPhase", "getComposerDraftTextForPhase", "getCurrentPhase", "getEmptyComposerErrorMessage", "isHumanJudgeQuestionPhase", "l", "setStatus", "speakerName"], "settings": [], "ui": ["messageInputEl"], "platform": []});
    function create(context) {
        function clearPendingVoiceSubmission() {
            context.state.pendingVoiceSubmission = null;
        }


        function setPendingVoiceSubmission(reason, phaseId) {
            const phase = context.services.getCurrentPhase();
            context.state.pendingVoiceSubmission = reason && phaseId ? {
                reason, phaseId,
                capturedDraft: phase?.id === phaseId ? context.services.getComposerDraftTextForPhase(phase) : "",
                recordingDraft: String(context.state.draftBeforeRecording || ""),
                awaitingVoice: context.state.isRecording || context.state.voiceFinalizePending
            } : null;
        }


        function getPendingVoiceSubmissionReason() {
            return context.state.pendingVoiceSubmission?.reason || "";
        }


        function resolvePendingVoiceSubmission() {
            const pending = context.state.pendingVoiceSubmission;
            if (!pending) return false;
            const current = context.services.getCurrentPhase();
            clearPendingVoiceSubmission();
            if (!current || current.id !== pending.phaseId || context.state.completed) return false;
            const currentText = pending.capturedDraft;
            const didCommit = context.services.commitMainComposerSubmission(current, currentText);

            if (pending.reason === "timeout") {
                if (context.services.isHumanJudgeQuestionPhase(current)) {
                    if (!didCommit) {
                        context.ui.messageInputEl.value = "";
                        context.services.clearMainComposerJudgeBinding();
                    }
                    context.services.setStatus(
                        didCommit
                        ? context.services.l("Time is up. Submitted the judge question.", "Le temps est écoulé. La question du juge a été soumise.")
                        : context.services.l("Time is up for the judge question.", "Le temps est écoulé pour la question du juge.")
                    );
                } else {
                    context.services.setStatus(didCommit ? context.services.l("Time is up. Submitted the current turn.", "Le temps est écoulé. Le tour a été soumis.") : context.services.l("Time is up for the current phase.", "Le temps est écoulé pour la phase actuelle."));
                }
                context.services.concludeTimedOutHumanPhase(current);
                return true;
            }

            if (!didCommit) {
                context.services.setStatus(context.services.getEmptyComposerErrorMessage(current), true);
                return false;
            }

            if (context.services.isHumanJudgeQuestionPhase(current)) context.services.setStatus(context.services.l("Judge question submitted.", "Question du juge soumise."));
            else context.services.setStatus(`${context.services.speakerName(current.speaker)} ${context.services.l("submitted the current turn.", "a soumis le tour actuel.")}`);
            context.services.advancePhase();
            return true;
        }
        return Object.freeze({clearPendingVoiceSubmission,setPendingVoiceSubmission,getPendingVoiceSubmissionReason,resolvePendingVoiceSubmission});
    }
    return Object.freeze({create,dependencies});
});
